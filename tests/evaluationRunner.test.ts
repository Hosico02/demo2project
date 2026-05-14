import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runEvaluation } from '../src/eval/evaluationRunner.js';
import { writeEvaluationReport } from '../src/eval/reportWriter.js';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

describe('EvaluationRunner — A/B comparison', () => {
  it('runs bad-node-cli through both paths and emits a comparison row', async () => {
    const rows = await runEvaluation({
      systemRoot: repoRoot,
      caseName: 'bad-node-cli',
      maxIterations: 1,
      updateRegressionSpec: false,
    });
    expect(rows.length).toBe(1);
    const r = rows[0]!;
    expect(r.case).toBe('bad-node-cli');
    expect(r.baseline_score_after).toBeGreaterThanOrEqual(0);
    expect(r.demo2project_score_after).toBeGreaterThanOrEqual(0);
    expect(['demo2project_wins', 'baseline_equivalent', 'inconclusive']).toContain(r.recommendation);
  });

  it('demo2project path produces zero unverified_changes', async () => {
    const rows = await runEvaluation({
      systemRoot: repoRoot,
      caseName: 'bad-node-cli',
      maxIterations: 1,
      updateRegressionSpec: false,
    });
    expect(rows[0]!.demo2project_unverified_changes).toBe(0);
  });

  it('reports known defect discovery and repair metrics separately from score', async () => {
    const rows = await runEvaluation({
      systemRoot: repoRoot,
      caseName: 'bad-node-cli',
      maxIterations: 1,
      updateRegressionSpec: false,
    });
    const r = rows[0]!;
    expect(r.known_defects_total).toBeGreaterThan(0);
    expect(r.known_defects_detected_before).toBeGreaterThan(0);
    expect(r.demo2project_bug_discovery_rate).toBeGreaterThan(0);
    expect(r.demo2project_bug_fix_rate).toBeGreaterThanOrEqual(0);
    expect(r.demo2project_known_defects_remaining).toBeGreaterThanOrEqual(0);
  });

  it('baseline path produces > 0 unverified_changes (proving the gap)', async () => {
    const rows = await runEvaluation({
      systemRoot: repoRoot,
      caseName: 'bad-node-cli',
      maxIterations: 1,
      updateRegressionSpec: false,
    });
    expect(rows[0]!.baseline_unverified_changes).toBeGreaterThan(0);
  });

  it('writeEvaluationReport produces JSON + MD at reports/evaluation/', async () => {
    const rows = await runEvaluation({
      systemRoot: repoRoot,
      caseName: 'bad-node-cli',
      maxIterations: 1,
      updateRegressionSpec: false,
    });
    const out = await fs.mkdtemp(path.join(tmpdir(), 'd2p-eval-report-'));
    const paths = await writeEvaluationReport(repoRoot, rows, { outputDir: out });
    const jsonStat = await fs.stat(paths.json);
    const mdStat = await fs.stat(paths.md);
    expect(jsonStat.size).toBeGreaterThan(0);
    expect(mdStat.size).toBeGreaterThan(0);
  });
});
