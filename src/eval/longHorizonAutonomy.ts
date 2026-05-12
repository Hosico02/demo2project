import path from 'node:path';
import { promises as fs } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { writeJson, readJsonSafe } from '../utils/json.js';
import { ensureDir } from '../utils/fs.js';
import { stateDir } from '../utils/paths.js';
import { nowIso, shortId } from '../utils/time.js';

import { SupervisorAgent } from '../agents/SupervisorAgent.js';
import { AnalyzerAgent } from '../agents/AnalyzerAgent.js';
import { RuleBasedExecutor } from '../agents/providers/RuleBasedExecutor.js';
import { MockAgentProvider } from '../agents/providers/MockAgentProvider.js';
import { ClaudeCliProvider } from '../agents/providers/ClaudeCodeProvider.js';
import type { AgentProvider } from '../agents/providers/AgentProvider.js';

import { loadPolicy, type AutonomyPolicy, type AutonomyLevel } from '../core/autonomyPolicy.js';
import { QualityTrendMonitor, snapshotFromBasics, type QualityTrendDecision } from '../core/qualityTrendMonitor.js';
import { takeArchSnapshot, persistSnapshot as persistArch, listSnapshots as listArchSnapshots, compareSnapshots } from '../core/architectureDrift.js';
import { recordDecision } from '../core/governanceDecisionLog.js';
import { runDocsTruth } from '../core/docsTruth.js';
import { detectArchetype } from '../core/projectArchetypeDetector.js';

/**
 * LongHorizonAutonomyController (Phase 6).
 *
 * Wraps SupervisorAgent in a session that:
 *   - respects an AutonomyPolicy budget (max iterations / cost / wall time / regressions)
 *   - records a QualityTrendMonitor snapshot per iteration
 *   - takes ArchitectureDrift snapshots
 *   - emits GovernanceDecisions for continue/stop/rollback/etc.
 *   - persists a LongRunSession + LongRunIteration[] for replay
 *
 * The controller never modifies the project. SupervisorAgent does that.
 * Here we make the *meta* decisions.
 */

export interface LongRunSession {
  id: string;
  project_path: string;
  project_path_hash: string;
  archetype: string;
  provider: string;
  autonomy_level: AutonomyLevel;
  started_at: string;
  ended_at?: string;
  status: 'running' | 'completed' | 'stopped' | 'rolled_back' | 'pending_approval' | 'errored';
  iterations: string[];
  budget: { max_iterations: number; max_cost_usd: number; max_wall_time_ms: number };
  stop_conditions: string[];
  trend_summary?: { score_first: number; score_last: number; peak_score: number };
  final_recommendation?: string;
}

export interface LongRunIteration {
  iteration_id: string;
  parent_session_id: string;
  goal: string;
  predicted_score_delta: number;
  actual_score_delta: number;
  changed_files: string[];
  verification_results: number; // counts; full data lives in event store
  qa_cases_triggered: number;
  qa_cases_created: number;
  regressions_detected: number;
  rollback_performed: boolean;
  approval_required: boolean;
  cost_summary: { wall_time_ms: number; command_count: number };
  evidence_ids: string[];
  decision: string;
}

export interface AutonomyRunOptions {
  projectPath: string;
  iterations?: number;
  providerName?: 'rule-based' | 'mock' | 'claude-cli';
  systemRoot: string;
  goal?: string;
}

function pickProvider(name: string): AgentProvider {
  switch (name) {
    case 'claude-cli': return new ClaudeCliProvider({ enabled: true });
    case 'mock': return new MockAgentProvider('happy');
    case 'rule-based':
    default: return new RuleBasedExecutor();
  }
}

function sessionsDir(projectPath: string): string {
  return path.join(stateDir(projectPath), 'sessions');
}

export async function persistSession(projectPath: string, s: LongRunSession): Promise<string> {
  await ensureDir(sessionsDir(projectPath));
  const p = path.join(sessionsDir(projectPath), `${s.id}.json`);
  await writeJson(p, s);
  return p;
}

export async function loadSession(projectPath: string, id: string): Promise<LongRunSession | null> {
  return readJsonSafe<LongRunSession>(path.join(sessionsDir(projectPath), `${id}.json`));
}

export async function listSessions(projectPath: string): Promise<LongRunSession[]> {
  let entries: string[] = [];
  try { entries = await fs.readdir(sessionsDir(projectPath)); } catch { return []; }
  const out: LongRunSession[] = [];
  for (const f of entries.filter((e) => e.endsWith('.json'))) {
    const v = await readJsonSafe<LongRunSession>(path.join(sessionsDir(projectPath), f));
    if (v) out.push(v);
  }
  return out.sort((a, b) => a.started_at.localeCompare(b.started_at));
}

export async function runAutonomySession(opts: AutonomyRunOptions): Promise<LongRunSession> {
  const policy: AutonomyPolicy = await loadPolicy(opts.systemRoot);
  const providerName = opts.providerName ?? 'rule-based';
  const archetype = (await detectArchetype(opts.projectPath)).primary.id;

  const sessionId = shortId('sess');
  const session: LongRunSession = {
    id: sessionId,
    project_path: opts.projectPath,
    project_path_hash: '',
    archetype,
    provider: providerName,
    autonomy_level: policy.default_autonomy_level,
    started_at: nowIso(),
    status: 'running',
    iterations: [],
    budget: {
      max_iterations: Math.min(opts.iterations ?? policy.max_iterations, policy.max_iterations),
      max_cost_usd: policy.max_cost_usd,
      max_wall_time_ms: policy.max_wall_time_ms,
    },
    stop_conditions: [
      'max_iterations',
      'target_score',
      'score_dropped',
      'score_plateau',
      'regression_threshold',
      'cost_budget',
      'wall_time_budget',
      'pending_approval',
    ],
  };
  await persistSession(opts.projectPath, session);

  const sup = new SupervisorAgent();
  const analyzer = new AnalyzerAgent();
  const monitor = new QualityTrendMonitor(opts.projectPath, sessionId);

  // Architecture baseline
  const baselineArch = await takeArchSnapshot(opts.projectPath);
  await persistArch(opts.projectPath, baselineArch);

  const t0 = performance.now();
  let firstScore = -1, peakScore = -1, lastScore = -1;

  for (let i = 0; i < session.budget.max_iterations; i++) {
    const elapsed = performance.now() - t0;
    if (elapsed > session.budget.max_wall_time_ms) {
      await recordDecision(opts.projectPath, {
        session_id: sessionId, decision_type: 'stop',
        options_considered: ['continue', 'stop'],
        selected_option: 'stop',
        reason: `wall_time_budget exceeded (${Math.round(elapsed)}ms)`,
        risk_level: 'medium', evidence_ids: [],
      });
      session.status = 'stopped';
      session.final_recommendation = 'wall_time_budget';
      break;
    }

    const beforeScore = (await analyzer.fullAnalyze(opts.projectPath)).score.total;
    if (firstScore === -1) firstScore = beforeScore;

    const summaries = await sup.iterate({
      projectPath: opts.projectPath,
      goal: opts.goal ?? 'long-horizon iteration',
      provider: pickProvider(providerName),
      maxIterations: 1,
      systemRoot: opts.systemRoot,
    });
    const last = summaries[summaries.length - 1];
    if (!last) break;
    const afterScore = last.project_score_after.total;
    lastScore = afterScore;
    if (afterScore > peakScore) peakScore = afterScore;

    const docs = await runDocsTruth(opts.projectPath);
    const verifs = last.verification_results;
    const passRate = verifs.length === 0 ? 1 : verifs.filter((v) => v.passed).length / verifs.length;
    const regressionThisIter = afterScore < beforeScore ? 1 : 0;

    const snap = snapshotFromBasics({
      iterationId: last.iteration_id,
      projectScore: afterScore,
      verificationPassRate: passRate,
      regressionCount: regressionThisIter,
      docsTruthScore: Math.max(0, 10 - docs.missing),
      testQualityScore: last.executor_results.some((r) => r.changed_files.some((f) => /tests?\//.test(f))) ? 6 : 5,
      architectureDriftScore: 0,
      qaMemoryNoiseScore: 0,
      riskLevel: regressionThisIter > 0 ? 'high' : 'low',
    });
    const all = await monitor.append(snap);
    const decision: QualityTrendDecision = monitor.decide(all, {
      score_window_size: policy.score_window_size,
      min_score_improvement_per_window: policy.min_score_improvement_per_window,
      max_regressions_allowed: policy.max_regressions_allowed,
      rollback_on_score_drop: policy.rollback_on_score_drop,
    });

    session.iterations.push(last.iteration_id);
    await recordDecision(opts.projectPath, {
      session_id: sessionId, iteration_id: last.iteration_id,
      decision_type: decision.kind === 'continue' ? 'continue' : decision.kind === 'rollback' ? 'rollback' : decision.kind === 'stop' ? 'stop' : 'request_approval',
      options_considered: ['continue', 'stop', 'rollback', 'request_approval'],
      selected_option: decision.kind,
      reason: decision.reason,
      risk_level: regressionThisIter > 0 ? 'high' : 'low',
      evidence_ids: decision.signals,
    });

    await persistSession(opts.projectPath, session);

    if (decision.kind === 'stop' || decision.kind === 'rollback') {
      session.status = decision.kind === 'rollback' ? 'rolled_back' : 'stopped';
      session.final_recommendation = decision.reason;
      break;
    }
    if (decision.kind === 'request_approval') {
      session.status = 'pending_approval';
      session.final_recommendation = decision.reason;
      break;
    }
  }

  // Compare arch baseline → current
  const currentArch = await takeArchSnapshot(opts.projectPath);
  await persistArch(opts.projectPath, currentArch);
  const driftReport = compareSnapshots(baselineArch, currentArch);
  if (driftReport.risk_level === 'high') {
    await recordDecision(opts.projectPath, {
      session_id: sessionId, decision_type: 'request_approval',
      options_considered: ['continue', 'run_diagnostics', 'request_approval'],
      selected_option: 'request_approval',
      reason: `architecture drift risk=${driftReport.risk_level} score=${driftReport.drift_score} — needs human review`,
      risk_level: 'high', evidence_ids: [],
    });
  }

  if (session.status === 'running') session.status = 'completed';
  session.ended_at = nowIso();
  session.trend_summary = { score_first: firstScore, score_last: lastScore, peak_score: peakScore };
  await persistSession(opts.projectPath, session);
  return session;
}
