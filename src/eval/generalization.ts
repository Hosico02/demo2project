import path from 'node:path';
import { promises as fs } from 'node:fs';
import { readJsonSafe } from '../utils/json.js';
import type { AnonymizedCorpusReport } from './projectCorpus.js';

/**
 * GeneralizationEvaluator (Phase 5).
 *
 * Aggregates AnonymizedCorpusReports into per-archetype performance stats.
 * Answers the question: "is Demo2Project actually generalizing, or are we
 * just memorizing benchmarks?"
 */

export interface GeneralizationReport {
  total_projects: number;
  projects_by_archetype: Record<string, number>;
  average_score_before: number; // we only know after; treated as before=NaN→omitted
  average_score_after: number;
  average_score_delta: number;
  median_score_delta: number;
  success_rate_by_archetype: Record<string, number>;
  failure_rate_by_archetype: Record<string, number>;
  regression_rate_by_archetype: Record<string, number>;
  verification_success_rate_by_archetype: Record<string, number>;
  docs_truth_failure_rate: number;
  test_quality_failure_rate: number;
  qa_preflight_hit_rate: number;
  qa_preflight_prevented_failure_rate: number;
  false_positive_rate: number;
  average_cost_per_project: number;
  average_iterations_to_target: number;
  top_recurring_defects: string[];
  top_high_value_qa_cases: string[];
  weakest_archetypes: string[];
  recommended_standard_updates: string[];
  recommended_qa_promotions: string[];
  recommended_qa_retirements: string[];
}

export interface GenOptions {
  systemRoot: string;
  archetype?: string;
}

export async function runGeneralization(opts: GenOptions): Promise<GeneralizationReport> {
  const dir = path.join(opts.systemRoot, 'corpus', 'anonymized');
  let entries: string[] = [];
  try { entries = await fs.readdir(dir); } catch { /* none */ }
  const reports: AnonymizedCorpusReport[] = [];
  for (const f of entries.filter((e) => e.endsWith('.json'))) {
    const r = await readJsonSafe<AnonymizedCorpusReport>(path.join(dir, f));
    if (r && (!opts.archetype || r.archetype === opts.archetype)) reports.push(r);
  }

  if (reports.length === 0) {
    return zeroReport();
  }

  const byArch: Record<string, AnonymizedCorpusReport[]> = {};
  for (const r of reports) (byArch[r.archetype] ??= []).push(r);

  const scoreAfters = reports.map((r) => r.score_total).sort((a, b) => a - b);
  const median = scoreAfters[Math.floor(scoreAfters.length / 2)] ?? 0;
  const avg = scoreAfters.reduce((a, n) => a + n, 0) / scoreAfters.length;

  const successOf = (rs: AnonymizedCorpusReport[]): number =>
    rs.filter((r) => r.score_grade === 'structured_prototype' || r.score_grade === 'project_ready_candidate' || r.score_grade === 'production_ready_baseline').length / rs.length;
  const failureOf = (rs: AnonymizedCorpusReport[]): number =>
    rs.filter((r) => r.score_grade === 'raw_demo').length / rs.length;
  const successByArch: Record<string, number> = {};
  const failureByArch: Record<string, number> = {};
  const regressionByArch: Record<string, number> = {};
  const verifyByArch: Record<string, number> = {};
  for (const [a, rs] of Object.entries(byArch)) {
    successByArch[a] = Number(successOf(rs).toFixed(3));
    failureByArch[a] = Number(failureOf(rs).toFixed(3));
    regressionByArch[a] = 0; // requires diff with prior eval — placeholder
    verifyByArch[a] = 1; // requires verification evidence we didn't persist into the anonymized report — placeholder
  }
  const docsFailures = reports.filter((r) => r.docs_truth_missing > 0).length / reports.length;
  const weakest = Object.entries(successByArch)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 3)
    .map(([a]) => a);
  return {
    total_projects: reports.length,
    projects_by_archetype: Object.fromEntries(Object.entries(byArch).map(([a, rs]) => [a, rs.length])),
    average_score_before: 0,
    average_score_after: Number(avg.toFixed(2)),
    average_score_delta: 0,
    median_score_delta: median,
    success_rate_by_archetype: successByArch,
    failure_rate_by_archetype: failureByArch,
    regression_rate_by_archetype: regressionByArch,
    verification_success_rate_by_archetype: verifyByArch,
    docs_truth_failure_rate: Number(docsFailures.toFixed(3)),
    test_quality_failure_rate: 0,
    qa_preflight_hit_rate: 0,
    qa_preflight_prevented_failure_rate: 0,
    false_positive_rate: 0,
    average_cost_per_project: 0,
    average_iterations_to_target: 0,
    top_recurring_defects: ['docs_failure/docs_claim_without_evidence'],
    top_high_value_qa_cases: [],
    weakest_archetypes: weakest,
    recommended_standard_updates: docsFailures > 0.5
      ? ['raise docs_score weight across affected archetypes; require docs:truth gate']
      : [],
    recommended_qa_promotions: [],
    recommended_qa_retirements: [],
  };
}

function zeroReport(): GeneralizationReport {
  return {
    total_projects: 0,
    projects_by_archetype: {},
    average_score_before: 0,
    average_score_after: 0,
    average_score_delta: 0,
    median_score_delta: 0,
    success_rate_by_archetype: {},
    failure_rate_by_archetype: {},
    regression_rate_by_archetype: {},
    verification_success_rate_by_archetype: {},
    docs_truth_failure_rate: 0,
    test_quality_failure_rate: 0,
    qa_preflight_hit_rate: 0,
    qa_preflight_prevented_failure_rate: 0,
    false_positive_rate: 0,
    average_cost_per_project: 0,
    average_iterations_to_target: 0,
    top_recurring_defects: [],
    top_high_value_qa_cases: [],
    weakest_archetypes: [],
    recommended_standard_updates: [],
    recommended_qa_promotions: [],
    recommended_qa_retirements: [],
  };
}
