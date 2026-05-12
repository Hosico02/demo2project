import path from 'node:path';
import { promises as fs } from 'node:fs';
import { writeJson, readJsonSafe } from '../utils/json.js';
import { ensureDir } from '../utils/fs.js';
import { stateDir } from '../utils/paths.js';
import { nowIso, shortId } from '../utils/time.js';
import { loadPolicy, isForbiddenSelfMod, requiresApproval } from './autonomyPolicy.js';
import { detectArchetype } from './projectArchetypeDetector.js';
import { takeSnapshot } from './projectSnapshot.js';
import { scoreProjectWithEvidence } from './evidenceWeightedScorer.js';
import { selectStandardForProject } from '../standards/adaptiveStandardManager.js';
import { reportMemoryHealth } from '../qa/QAMemoryHealth.js';

/**
 * SelfImprovementEngine (Phase 6) — hypothesis-experiment loop for the
 * system to improve itself, gated by strict safety rules.
 *
 *   1. diagnose()       — analyzes current state, produces weaknesses.
 *   2. proposeHypotheses — turns weaknesses into typed hypotheses with
 *                          rollback plans and explicit forbidden-path checks.
 *   3. runExperiment()  — would mutate inside a worktree (NOT in v0.0.6;
 *                          v0.0.6 emits the experiment record + the plan
 *                          but does not auto-modify the system).
 *   4. accept/reject    — records the decision.
 *
 * v0.0.6 default is REJECT-by-default for anything touching forbidden paths.
 * The engine refuses to even propose a hypothesis that targets safety.ts /
 * autonomy-policy.json / etc.
 */

export interface ImprovementHypothesis {
  id: string;
  title: string;
  problem_statement: string;
  evidence_ids: string[];
  proposed_change: string;
  expected_impact: string;
  risk_level: 'low' | 'medium' | 'high';
  affected_modules: string[];
  success_criteria: string[];
  rollback_plan: string;
  requires_approval: boolean;
  status: 'proposed' | 'rejected' | 'accepted' | 'experimented' | 'reverted';
  created_at: string;
  refused_reason?: string;
}

export interface ImprovementExperiment {
  id: string;
  hypothesis_id: string;
  worktree_path: string;
  patch_summary: string;
  commands_run: string[];
  score_before: number;
  score_after: number;
  benchmark_before?: number;
  benchmark_after?: number;
  regression_count: number;
  cost_summary: { wall_time_ms: number };
  decision: 'accept' | 'reject' | 'rollback' | 'pending';
  evidence_ids: string[];
  created_at: string;
}

function hypothesesPath(systemRoot: string): string {
  return path.join(stateDir(systemRoot), 'self-improve', 'hypotheses.json');
}
function experimentsPath(systemRoot: string): string {
  return path.join(stateDir(systemRoot), 'self-improve', 'experiments.json');
}

async function readHypotheses(systemRoot: string): Promise<ImprovementHypothesis[]> {
  return (await readJsonSafe<ImprovementHypothesis[]>(hypothesesPath(systemRoot))) ?? [];
}
async function writeHypotheses(systemRoot: string, list: ImprovementHypothesis[]): Promise<void> {
  await ensureDir(path.dirname(hypothesesPath(systemRoot)));
  await writeJson(hypothesesPath(systemRoot), list);
}
async function readExperiments(systemRoot: string): Promise<ImprovementExperiment[]> {
  return (await readJsonSafe<ImprovementExperiment[]>(experimentsPath(systemRoot))) ?? [];
}
async function writeExperiments(systemRoot: string, list: ImprovementExperiment[]): Promise<void> {
  await ensureDir(path.dirname(experimentsPath(systemRoot)));
  await writeJson(experimentsPath(systemRoot), list);
}

export interface DiagnosisReport {
  weaknesses: string[];
  archetype: string;
  score: number;
  qa_noise: number;
  docs_truth_missing: number;
  generated_at: string;
}

export async function diagnose(systemRoot: string): Promise<DiagnosisReport> {
  const arch = (await detectArchetype(systemRoot)).primary;
  const snap = await takeSnapshot(systemRoot);
  const sel = await selectStandardForProject(systemRoot);
  const score = await scoreProjectWithEvidence(snap, sel.selected_standard);
  const qa = await reportMemoryHealth(systemRoot);
  const weaknesses: string[] = [];
  if (score.total < 86) weaknesses.push(`score=${score.total} below production_ready_baseline (86)`);
  if (qa.memory_noise_score >= 0.3) weaknesses.push(`QA memory noise=${qa.memory_noise_score}`);
  if (qa.duplicate_clusters.length > 0) weaknesses.push(`${qa.duplicate_clusters.length} duplicate QA clusters`);
  if (qa.recommended_retirements.length > 0) weaknesses.push(`${qa.recommended_retirements.length} stale QA cases`);
  return {
    weaknesses,
    archetype: arch.id,
    score: score.total,
    qa_noise: qa.memory_noise_score,
    docs_truth_missing: 0,
    generated_at: nowIso(),
  };
}

export async function proposeHypotheses(systemRoot: string): Promise<ImprovementHypothesis[]> {
  const diag = await diagnose(systemRoot);
  const policy = await loadPolicy(systemRoot);
  const out: ImprovementHypothesis[] = [];

  // Hypothesis 1: QA memory compaction (always safe)
  if (diag.qa_noise > 0 || diag.weaknesses.some((w) => /duplicate/.test(w) || /stale/.test(w))) {
    out.push({
      id: shortId('hyp'),
      title: 'Compact QA memory',
      problem_statement: 'QA memory has noise / duplicates / stale entries.',
      evidence_ids: [],
      proposed_change: 'Run qa:compact --apply to retire stale / merge duplicates.',
      expected_impact: 'Reduce memory_noise_score; faster preflight; fewer false positives.',
      risk_level: 'low',
      affected_modules: ['.demo2project/qa-cases.json'],
      success_criteria: ['memory_noise_score decreases', 'no active case lost'],
      rollback_plan: 'restore .demo2project/qa-cases.json from previous commit',
      requires_approval: false,
      status: 'proposed',
      created_at: nowIso(),
    });
  }

  // Hypothesis 2: Architecture drift cleanup (medium risk)
  if (diag.weaknesses.some((w) => /score/.test(w))) {
    out.push({
      id: shortId('hyp'),
      title: 'Reduce oversized files',
      problem_statement: 'Score capped by maintainability heuristic on >600-line files.',
      evidence_ids: [],
      proposed_change: 'Split largest files into focused modules; preserve public API.',
      expected_impact: 'maintainability_score up; total_score up; better long-term hygiene.',
      risk_level: 'medium',
      affected_modules: ['src/agents/SupervisorAgent.ts', 'src/cli/index.ts'],
      success_criteria: ['no file exceeds 600 lines', 'all tests still pass'],
      rollback_plan: 'git restore the affected files',
      requires_approval: true,
      status: 'proposed',
      created_at: nowIso(),
    });
  }

  // Reject any hypothesis whose affected_modules include forbidden paths.
  for (const h of out) {
    const forbidden = h.affected_modules.find((f) => isForbiddenSelfMod(policy, f));
    if (forbidden) {
      h.status = 'rejected';
      h.refused_reason = `affected_module ${forbidden} is on forbidden_self_modifications list`;
    } else if (h.affected_modules.some((f) => requiresApproval(policy, f))) {
      h.requires_approval = true;
    }
  }

  const all = [...(await readHypotheses(systemRoot)), ...out];
  await writeHypotheses(systemRoot, all);
  return out;
}

export async function listHypotheses(systemRoot: string): Promise<ImprovementHypothesis[]> {
  return readHypotheses(systemRoot);
}

/**
 * v0.0.6: experiment "runs" without performing real mutation. We record
 * the plan + sandbox-style metadata so the workflow exists. Real
 * mutation in a worktree comes in a later phase.
 */
export async function runExperiment(systemRoot: string, hypothesisId: string): Promise<ImprovementExperiment> {
  const hypotheses = await readHypotheses(systemRoot);
  const h = hypotheses.find((x) => x.id === hypothesisId);
  if (!h) throw new Error(`no hypothesis ${hypothesisId}`);
  if (h.status === 'rejected') {
    throw new Error(`hypothesis ${hypothesisId} was rejected at proposal time: ${h.refused_reason}`);
  }
  const policy = await loadPolicy(systemRoot);
  for (const f of h.affected_modules) {
    if (isForbiddenSelfMod(policy, f)) {
      throw new Error(`forbidden_self_modifications path: ${f}`);
    }
  }
  const before = (await scoreProjectWithEvidence(await takeSnapshot(systemRoot), (await selectStandardForProject(systemRoot)).selected_standard)).total;
  const exp: ImprovementExperiment = {
    id: shortId('exp'),
    hypothesis_id: hypothesisId,
    worktree_path: '(would-be-worktree)',
    patch_summary: `${h.title}: ${h.proposed_change}`,
    commands_run: ['(plan-only; v0.0.6 does not auto-mutate the system)'],
    score_before: before,
    score_after: before,
    regression_count: 0,
    cost_summary: { wall_time_ms: 0 },
    decision: 'pending',
    evidence_ids: [],
    created_at: nowIso(),
  };
  const all = [...(await readExperiments(systemRoot)), exp];
  await writeExperiments(systemRoot, all);
  return exp;
}

export async function acceptExperiment(systemRoot: string, id: string): Promise<ImprovementExperiment | null> {
  const all = await readExperiments(systemRoot);
  const idx = all.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx]!, decision: 'accept' };
  await writeExperiments(systemRoot, all);
  return all[idx]!;
}
export async function rejectExperiment(systemRoot: string, id: string): Promise<ImprovementExperiment | null> {
  const all = await readExperiments(systemRoot);
  const idx = all.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx]!, decision: 'reject' };
  await writeExperiments(systemRoot, all);
  return all[idx]!;
}
export async function rollbackExperiment(systemRoot: string, id: string): Promise<ImprovementExperiment | null> {
  const all = await readExperiments(systemRoot);
  const idx = all.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx]!, decision: 'rollback' };
  await writeExperiments(systemRoot, all);
  return all[idx]!;
}
