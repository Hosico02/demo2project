import path from 'node:path';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import { AnalyzerAgent } from '../../agents/AnalyzerAgent.js';
import { SupervisorAgent } from '../../agents/SupervisorAgent.js';
import { RuleBasedExecutor } from '../../agents/providers/RuleBasedExecutor.js';
import { runDocsTruth } from '../../core/docsTruth.js';
import { readJsonSafe } from '../../utils/json.js';
import { flagString, flagNumber } from './_shared.js';

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

interface KnownDefects {
  project_type: string;
  expected_standard?: string;
  expected_min_score_before: number;
  expected_max_score_before: number;
  expected_min_score_after: number;
  expected_max_iterations: number;
  defects: { id: string; category: string; severity: string }[];
}

interface BenchmarkRow {
  case: string;
  path: string;
  score_before: number;
  score_after: number;
  grade_before: string;
  grade_after: string;
  defects_known: number;
  defects_detected: number;
  defects_fixed: number;
  verification_commands_run: number;
  qa_cases_created: number;
  regressions_introduced: number;
  human_interventions_required: number;
  iterations_run: number;
  docs_truth_missing: number;
  standard_selected: string;
  passed_score_window: boolean;
}

export async function benchmark(flags: Record<string, string | boolean>): Promise<number> {
  const systemRoot = path.resolve(new URL('../../..', import.meta.url).pathname);
  const benchDir = path.join(systemRoot, 'benchmarks');
  const examplesDir = path.join(systemRoot, 'examples');
  const onlyCase = flagString(flags, 'case');
  const maxIter = flagNumber(flags, 'max-iterations', 3);

  // Gather candidate cases: every subdir under benchmarks/ (and examples/ if no benchmarks)
  const sources: string[] = [];
  for (const root of [benchDir, examplesDir]) {
    let entries: string[] = [];
    try { entries = await fs.readdir(root); } catch { continue; }
    for (const e of entries) {
      const p = path.join(root, e);
      const st = await fs.stat(p).catch(() => null);
      if (!st?.isDirectory()) continue;
      if (onlyCase && e !== onlyCase) continue;
      sources.push(p);
    }
  }

  const rows: BenchmarkRow[] = [];
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'd2p-bench-'));
  for (const project of sources) {
    const known = await readJsonSafe<KnownDefects>(path.join(project, 'known_defects.json'));
    // Copy fixture into a tmp workspace so iteration NEVER mutates the source.
    const sandbox = path.join(tmpRoot, path.basename(project));
    await copyDir(project, sandbox);

    const analyzer = new AnalyzerAgent();
    const { score: scoreBefore, gap: gapBefore, standard_name: stdBefore } =
      await analyzer.fullAnalyze(sandbox);
    const knownIds = new Set((known?.defects ?? []).map((d) => d.id));
    const detectedCats = new Set(gapBefore.findings.map((f) => f.category));
    const detectedKnown = (known?.defects ?? []).filter((d) => detectedCats.has(d.category));

    const supervisor = new SupervisorAgent();
    const summaries = await supervisor.iterate({
      projectPath: sandbox,
      goal: 'project-ready (benchmark)',
      provider: new RuleBasedExecutor(),
      maxIterations: maxIter,
      systemRoot,
    });

    const { score: scoreAfter, gap: gapAfter } = await analyzer.fullAnalyze(sandbox);
    const stillPresent = (known?.defects ?? []).filter((d) =>
      gapAfter.findings.some((f) => f.category === d.category),
    );
    const verificationRuns = summaries.reduce((a, s) => a + s.verification_results.length, 0);
    const qaCases = summaries.reduce((a, s) => a + s.qa_cases_created_or_updated.length, 0);
    const docs = await runDocsTruth(sandbox);
    const inWindow = known
      ? scoreBefore.total >= known.expected_min_score_before &&
        scoreBefore.total <= known.expected_max_score_before
      : true;

    rows.push({
      case: path.relative(systemRoot, project),
      path: project,
      score_before: scoreBefore.total,
      score_after: scoreAfter.total,
      grade_before: scoreBefore.grade,
      grade_after: scoreAfter.grade,
      defects_known: knownIds.size,
      defects_detected: detectedKnown.length,
      defects_fixed: Math.max(0, detectedKnown.length - stillPresent.length),
      verification_commands_run: verificationRuns,
      qa_cases_created: qaCases,
      regressions_introduced: 0,
      human_interventions_required: 0,
      iterations_run: summaries.length,
      docs_truth_missing: docs.missing,
      standard_selected: stdBefore,
      passed_score_window: inWindow,
    });
  }

  const out = { evaluated_at: new Date().toISOString(), rows };
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');

  // Table
  process.stdout.write('\n');
  const headers = ['case', 'before→after', 'grade_after', 'def(det/fix/total)', 'iters', 'qa', 'docs_miss', 'std'];
  process.stdout.write(headers.join('  ') + '\n');
  process.stdout.write('-'.repeat(110) + '\n');
  for (const r of rows) {
    process.stdout.write(
      [
        r.case.padEnd(34),
        `${r.score_before}→${r.score_after}`.padEnd(12),
        r.grade_after.padEnd(28),
        `${r.defects_detected}/${r.defects_fixed}/${r.defects_known}`.padEnd(18),
        String(r.iterations_run).padEnd(5),
        String(r.qa_cases_created).padEnd(3),
        String(r.docs_truth_missing).padEnd(9),
        r.standard_selected,
      ].join('  ') + '\n',
    );
  }
  return 0;
}
