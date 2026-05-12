import path from 'node:path';
import { promises as fs } from 'node:fs';
import { readJsonSafe, writeJson } from '../utils/json.js';
import { ensureDir } from '../utils/fs.js';
import { nowIso, shortId } from '../utils/time.js';
import type { AnonymizedCorpusReport } from './projectCorpus.js';

/**
 * CrossProjectLearningEngine (Phase 5) — aggregate per-project anonymized
 * reports into LearningPatterns.
 *
 * Inputs: corpus/reports/*.json (one per project).
 * Output: corpus/learning/patterns.json + emitted summary.
 *
 * The engine emits SUGGESTIONS only — promotion to QA case or standard
 * rule is gated by LearningGovernance (next module).
 */

export type LearningPatternType =
  | 'recurring_defect'
  | 'recurring_false_positive'
  | 'standard_gap'
  | 'verification_gap'
  | 'executor_failure_mode'
  | 'docs_truth_failure'
  | 'test_quality_failure'
  | 'dependency_issue'
  | 'project_structure_issue'
  | 'anti_gaming_pattern';

export interface LearningPattern {
  id: string;
  title: string;
  pattern_type: LearningPatternType;
  source_projects: string[];
  applicable_archetypes: string[];
  confidence: number;
  support_count: number;
  contradiction_count: number;
  examples: string[];
  recommended_action: string;
  promoted_to_qa_case: boolean;
  promoted_to_standard_rule: boolean;
  created_at: string;
  updated_at: string;
}

export interface LearnInput {
  systemRoot: string;
}

async function loadAllReports(systemRoot: string): Promise<AnonymizedCorpusReport[]> {
  const dir = path.join(systemRoot, 'corpus', 'anonymized');
  let entries: string[] = [];
  try { entries = await fs.readdir(dir); } catch { return []; }
  const out: AnonymizedCorpusReport[] = [];
  for (const f of entries.filter((e) => e.endsWith('.json'))) {
    const r = await readJsonSafe<AnonymizedCorpusReport>(path.join(dir, f));
    if (r) out.push(r);
  }
  return out;
}

export async function learnWorkspace(opts: LearnInput): Promise<LearningPattern[]> {
  const reports = await loadAllReports(opts.systemRoot);
  if (reports.length === 0) return [];
  const patterns: LearningPattern[] = [];

  // Pattern: many projects fail docs-truth → standard_gap on docs_score
  const docsLies = reports.filter((r) => r.docs_truth_missing > 0);
  if (docsLies.length >= 2) {
    patterns.push({
      id: shortId('pat'),
      title: `docs-truth failure recurring across ${docsLies.length} projects`,
      pattern_type: 'docs_truth_failure',
      source_projects: docsLies.map((r) => r.project_id),
      applicable_archetypes: Array.from(new Set(docsLies.map((r) => r.archetype))),
      confidence: Math.min(1, docsLies.length / Math.max(2, reports.length)),
      support_count: docsLies.reduce((a, r) => a + r.docs_truth_missing, 0),
      contradiction_count: 0,
      examples: docsLies.slice(0, 5).map((r) => `${r.archetype} project: ${r.docs_truth_missing} unverified README claims`),
      recommended_action: 'Raise docs_score weight or add docs:truth gating to project standards.',
      promoted_to_qa_case: false,
      promoted_to_standard_rule: false,
      created_at: nowIso(),
      updated_at: nowIso(),
    });
  }

  // Pattern: anti-gaming findings concentrate in some archetypes
  const byArch: Record<string, AnonymizedCorpusReport[]> = {};
  for (const r of reports) (byArch[r.archetype] ??= []).push(r);
  for (const [arch, rs] of Object.entries(byArch)) {
    const avgFindings = rs.reduce((a, r) => a + r.anti_gaming_findings, 0) / rs.length;
    if (avgFindings >= 1) {
      patterns.push({
        id: shortId('pat'),
        title: `${arch}: average ${avgFindings.toFixed(1)} anti-gaming finding(s) per project`,
        pattern_type: 'anti_gaming_pattern',
        source_projects: rs.map((r) => r.project_id),
        applicable_archetypes: [arch],
        confidence: Math.min(1, rs.length / 3),
        support_count: rs.length,
        contradiction_count: 0,
        examples: rs.slice(0, 3).map((r) => `${r.project_id}: ${r.anti_gaming_findings} findings`),
        recommended_action: `Tighten ${arch} standard to penalize the gaming patterns it sees most.`,
        promoted_to_qa_case: false,
        promoted_to_standard_rule: false,
        created_at: nowIso(),
        updated_at: nowIso(),
      });
    }
  }

  // Pattern: missing tests / build commands → standard_gap
  const noTests = reports.filter((r) => !r.structure_summary.has_tests);
  if (noTests.length >= 3) {
    patterns.push({
      id: shortId('pat'),
      title: `${noTests.length} projects ship without tests`,
      pattern_type: 'standard_gap',
      source_projects: noTests.map((r) => r.project_id),
      applicable_archetypes: Array.from(new Set(noTests.map((r) => r.archetype))),
      confidence: Math.min(1, noTests.length / reports.length),
      support_count: noTests.length,
      contradiction_count: 0,
      examples: noTests.slice(0, 5).map((r) => `${r.archetype}: ${r.project_id}`),
      recommended_action: 'Mark tests required at standard level; auto-generate placeholder via RuleBasedExecutor.',
      promoted_to_qa_case: false,
      promoted_to_standard_rule: false,
      created_at: nowIso(),
      updated_at: nowIso(),
    });
  }

  // Persist
  const dir = path.join(opts.systemRoot, 'corpus', 'learning');
  await ensureDir(dir);
  await writeJson(path.join(dir, 'patterns.json'), patterns);
  return patterns;
}

export async function loadPatterns(systemRoot: string): Promise<LearningPattern[]> {
  const p = path.join(systemRoot, 'corpus', 'learning', 'patterns.json');
  return (await readJsonSafe<LearningPattern[]>(p)) ?? [];
}

export async function learnProject(opts: { systemRoot: string; reportId: string }): Promise<LearningPattern[]> {
  // Project-scoped learning: derive single-project signals.
  const r = await readJsonSafe<AnonymizedCorpusReport>(path.join(opts.systemRoot, 'corpus', 'anonymized', `${opts.reportId}.json`));
  if (!r) return [];
  const out: LearningPattern[] = [];
  if (r.docs_truth_missing > 0) {
    out.push({
      id: shortId('pat'),
      title: `single-project docs-truth gap (${r.project_id})`,
      pattern_type: 'docs_truth_failure',
      source_projects: [r.project_id],
      applicable_archetypes: [r.archetype],
      confidence: 0.4,
      support_count: r.docs_truth_missing,
      contradiction_count: 0,
      examples: [`${r.docs_truth_missing} unverified README claims`],
      recommended_action: 'Run docs:truth; fix mismatches; rerun.',
      promoted_to_qa_case: false,
      promoted_to_standard_rule: false,
      created_at: nowIso(),
      updated_at: nowIso(),
    });
  }
  return out;
}
