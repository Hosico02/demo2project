import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runEvaluation } from '../src/eval/evaluationRunner.js';
import { writeEvaluationReport } from '../src/eval/reportWriter.js';
import { promises as fs } from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

describe('EvaluationRunner — A/B comparison', () => {
  it('runs bad-node-cli through both paths and emits a comparison row', async () => {
    const rows = await runEvaluation({
      systemRoot: repoRoot,
      caseName: 'bad-node-cli',
      maxIterations: 1,
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
    });
    expect(rows[0]!.demo2project_unverified_changes).toBe(0);
  });

  it('baseline path produces > 0 unverified_changes (proving the gap)', async () => {
    const rows = await runEvaluation({
      systemRoot: repoRoot,
      caseName: 'bad-node-cli',
      maxIterations: 1,
    });
    expect(rows[0]!.baseline_unverified_changes).toBeGreaterThan(0);
  });

  it('writeEvaluationReport produces JSON + MD at reports/evaluation/', async () => {
    const rows = await runEvaluation({
      systemRoot: repoRoot,
      caseName: 'bad-node-cli',
      maxIterations: 1,
    });
    const paths = await writeEvaluationReport(repoRoot, rows);
    const jsonStat = await fs.stat(paths.json);
    const mdStat = await fs.stat(paths.md);
    expect(jsonStat.size).toBeGreaterThan(0);
    expect(mdStat.size).toBeGreaterThan(0);
  });
});
