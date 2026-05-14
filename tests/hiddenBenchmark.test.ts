import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import { readJsonSafe } from '../src/utils/json.js';
import { runEvaluation } from '../src/eval/evaluationRunner.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

describe('Hidden benchmark', () => {
  it('hidden case exists with hidden_defects (not known_defects)', async () => {
    const dir = path.join(repoRoot, 'benchmarks', 'hidden', 'bad-generalization-cli');
    const known = await fs.stat(path.join(dir, 'known_defects.json')).catch(() => null);
    const hidden = await readJsonSafe<{ hidden_defects: unknown[] }>(path.join(dir, 'hidden_defects.json'));
    expect(known, 'hidden case must NOT expose known_defects.json').toBeNull();
    expect(hidden?.hidden_defects?.length).toBeGreaterThan(0);
  });

  it('runEvaluation --case alone does not pull from hidden/', async () => {
    const rows = await runEvaluation({
      systemRoot: repoRoot,
      caseName: 'bad-generalization-cli',
      maxIterations: 1,
      includeHidden: false,
      updateRegressionSpec: false,
    });
    expect(rows.length).toBe(0);
  });

  it('runEvaluation with includeHidden:true does pull from hidden/', async () => {
    const rows = await runEvaluation({
      systemRoot: repoRoot,
      caseName: 'bad-generalization-cli',
      maxIterations: 1,
      includeHidden: true,
      updateRegressionSpec: false,
    });
    expect(rows.length).toBe(1);
  });
});
