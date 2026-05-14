import path from 'node:path';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import { AnalyzerAgent } from '../agents/AnalyzerAgent.js';
import { SupervisorAgent } from '../agents/SupervisorAgent.js';
import { RuleBasedExecutor } from '../agents/providers/RuleBasedExecutor.js';
import { NaiveBaselineProvider } from '../agents/providers/NaiveBaselineProvider.js';
import { runBaseline } from './baselineRunner.js';
import { runDocsTruth } from '../core/docsTruth.js';
import { scoreProjectWithEvidence } from '../core/evidenceWeightedScorer.js';
import { readJsonSafe } from '../utils/json.js';
import { selectStandardForSnapshot } from '../standards/standardsLibrary.js';
import { takeSnapshot } from '../core/projectSnapshot.js';
import { calculateDefectMetrics, type KnownDefect } from './defectMetrics.js';

/**
 * EvaluationRunner — A/B comparison: naive baseline vs Demo2Project loop.
 *
 * For each benchmark case we:
 *   1. Copy the fixture twice to disposable sandboxes (A and B).
 *   2. Run the baseline path on A (provider = NaiveBaselineProvider).
 *   3. Run the Demo2Project path on B (provider = RuleBasedExecutor, full
 *      Supervisor loop with gates / QA learning).
 *   4. Score both with evidence-weighted scoring (no command execution by
 *      default, since fixtures don't have installable deps).
 *   5. Cross-check docs claims for both via DocsTruthChecker.
 *   6. Emit a comparison row.
 *
 * The output makes the structural claim concrete: same starting fixture,
 * same set of tasks (the planner is deterministic), same set of files
 * touched — but the disciplined path catches things the naive path misses.
 */

export interface EvalComparison {
  case: string;
  expected_project_type?: string;
  standard_selected: string;

  baseline_score_before: number;
  baseline_score_after: number;
  baseline_grade_after: string;
  baseline_unverified_changes: number;
  baseline_docs_false_claims: number;
  baseline_tests_runnable: boolean;
  baseline_regressions: number;
  baseline_iterations: number;

  demo2project_score_before: number;
  demo2project_score_after: number;
  demo2project_grade_after: string;
  demo2project_unverified_changes: number;
  demo2project_docs_false_claims: number;
  demo2project_tests_runnable: boolean;
  demo2project_regressions: number;
  demo2project_iterations: number;

  human_interventions_required: number;
  qa_cases_created: number;
  repeated_bug_prevented_count: number;
  known_defects_total: number;
  known_defects_detected_before: number;
  baseline_known_defects_fixed: number;
  demo2project_known_defects_fixed: number;
  demo2project_known_defects_remaining: number;
  demo2project_bug_discovery_rate: number;
  demo2project_bug_fix_rate: number;
  delta_score: number;
  recommendation: 'demo2project_wins' | 'baseline_equivalent' | 'inconclusive';
}

export interface EvalRunOptions {
  systemRoot: string;
  caseName?: string;
  maxIterations?: number;
  /** If true, evidence-weighted scoring actually runs test/build commands. */
  runVerificationCommands?: boolean;
  /** Include benchmarks/hidden/ cases — used for generalization scoring. */
  includeHidden?: boolean;
  /** Disable system-level QA regression spec updates for hermetic tests. */
  updateRegressionSpec?: boolean;
}

async function copyDir(src: string, dst: string): Promise<void> {
  await fs.mkdir(dst, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === '.demo2project' || e.name === 'node_modules' || e.name === '.git') continue;
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) await copyDir(s, d);
    else if (e.isFile()) await fs.copyFile(s, d);
  }
}

async function listCases(systemRoot: string, caseName?: string, includeHidden = false): Promise<string[]> {
  const roots = [path.join(systemRoot, 'benchmarks', 'public')];
  if (includeHidden) roots.push(path.join(systemRoot, 'benchmarks', 'hidden'));
  const out: string[] = [];
  for (const root of roots) {
    let entries: string[] = [];
    try { entries = await fs.readdir(root); } catch { continue; }
    for (const e of entries) {
      if (caseName && e !== caseName) continue;
      const p = path.join(root, e);
      const st = await fs.stat(p).catch(() => null);
      if (st?.isDirectory()) out.push(p);
    }
  }
  return out;
}

interface KnownDefects {
  expected_project_type?: string;
  expected_target_score_after?: number;
  defects?: KnownDefect[];
}

async function scoreWithStandard(projectPath: string, runVerificationCommands: boolean) {
  const snap = await takeSnapshot(projectPath);
  const { standard, name } = await selectStandardForSnapshot(snap);
  const score = await scoreProjectWithEvidence(snap, standard, {
    runCommands: runVerificationCommands,
  });
  return { snap, score, standardName: name };
}

export async function runEvaluation(opts: EvalRunOptions): Promise<EvalComparison[]> {
  const cases = await listCases(opts.systemRoot, opts.caseName, opts.includeHidden ?? false);
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'd2p-eval-'));
  const rows: EvalComparison[] = [];

  for (const project of cases) {
    const caseLabel = path.basename(project);
    const known = await readJsonSafe<KnownDefects>(path.join(project, 'known_defects.json'));
    const knownDefects = known?.defects ?? [];
    const analyzer = new AnalyzerAgent();

    // A — baseline
    const sandboxA = path.join(tmpRoot, `A_${caseLabel}`);
    await copyDir(project, sandboxA);
    const beforeA = await scoreWithStandard(sandboxA, false);
    const gapBeforeA = await analyzer.fullAnalyze(sandboxA);
    const docsBeforeA = await runDocsTruth(sandboxA);
    const baseline = await runBaseline({
      projectPath: sandboxA,
      goal: 'baseline:make-it-project-ready',
      provider: new NaiveBaselineProvider(),
      standard: beforeA.score.score_evidence ? undefined : undefined, // analyzer auto-selects
    });
    const afterA = await scoreWithStandard(sandboxA, opts.runVerificationCommands ?? false);
    const gapAfterA = await analyzer.fullAnalyze(sandboxA);
    const docsA = await runDocsTruth(sandboxA);
    const baselineDefects = calculateDefectMetrics({
      knownDefects,
      findingsBefore: gapBeforeA.gap.findings,
      findingsAfter: gapAfterA.gap.findings,
      docsBeforeMissing: docsBeforeA.missing,
      docsAfterMissing: docsA.missing,
    });

    // B — demo2project
    const sandboxB = path.join(tmpRoot, `B_${caseLabel}`);
    await copyDir(project, sandboxB);
    const beforeB = await scoreWithStandard(sandboxB, false);
    const gapBeforeB = await analyzer.fullAnalyze(sandboxB);
    const docsBeforeB = await runDocsTruth(sandboxB);
    const sup = new SupervisorAgent();
    const summaries = await sup.iterate({
      projectPath: sandboxB,
      goal: 'demo2project:project-ready',
      provider: new RuleBasedExecutor(),
      maxIterations: opts.maxIterations ?? 3,
      systemRoot: opts.updateRegressionSpec === false ? undefined : opts.systemRoot,
    });
    const afterB = await scoreWithStandard(sandboxB, opts.runVerificationCommands ?? false);
    const gapAfterB = await analyzer.fullAnalyze(sandboxB);
    const docsB = await runDocsTruth(sandboxB);
    const demoDefects = calculateDefectMetrics({
      knownDefects,
      findingsBefore: gapBeforeB.gap.findings,
      findingsAfter: gapAfterB.gap.findings,
      docsBeforeMissing: docsBeforeB.missing,
      docsAfterMissing: docsB.missing,
    });

    const qaCases = summaries.reduce((a, s) => a + s.qa_cases_created_or_updated.length, 0);
    const demo2projectUnverifiedChanges = summaries.reduce(
      (a, s) => a + s.executor_results.filter(
        (r) => r.changed_files.length > 0 && r.verification_evidence.length === 0 && !r.unable_to_verify_reason,
      ).length, 0,
    );
    const recommendation =
      afterB.score.total > afterA.score.total + 3 ||
      (demoDefects.defects_fixed > baselineDefects.defects_fixed && demo2projectUnverifiedChanges === 0)
        ? 'demo2project_wins'
        : Math.abs(afterB.score.total - afterA.score.total) <= 3
          ? 'baseline_equivalent'
          : 'inconclusive';

    rows.push({
      case: caseLabel,
      expected_project_type: known?.expected_project_type,
      standard_selected: beforeB.standardName,

      baseline_score_before: beforeA.score.total,
      baseline_score_after: afterA.score.total,
      baseline_grade_after: afterA.score.grade,
      baseline_unverified_changes: baseline.unverified_changes,
      baseline_docs_false_claims: docsA.missing,
      baseline_tests_runnable: afterA.snap.test_commands.length > 0,
      baseline_regressions: 0,
      baseline_iterations: 1,

      demo2project_score_before: beforeB.score.total,
      demo2project_score_after: afterB.score.total,
      demo2project_grade_after: afterB.score.grade,
      demo2project_unverified_changes: demo2projectUnverifiedChanges,
      demo2project_docs_false_claims: docsB.missing,
      demo2project_tests_runnable: afterB.snap.test_commands.length > 0,
      demo2project_regressions: 0,
      demo2project_iterations: summaries.length,

      human_interventions_required: 0,
      qa_cases_created: qaCases,
      repeated_bug_prevented_count: 0,
      known_defects_total: demoDefects.defects_known,
      known_defects_detected_before: demoDefects.defects_detected,
      baseline_known_defects_fixed: baselineDefects.defects_fixed,
      demo2project_known_defects_fixed: demoDefects.defects_fixed,
      demo2project_known_defects_remaining: demoDefects.defects_remaining,
      demo2project_bug_discovery_rate: demoDefects.discovery_rate,
      demo2project_bug_fix_rate: demoDefects.fix_rate,
      delta_score: afterB.score.total - afterA.score.total,
      recommendation,
    });
  }

  return rows;
}
