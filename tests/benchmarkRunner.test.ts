import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import { AnalyzerAgent } from '../src/agents/AnalyzerAgent.js';
import { readJsonSafe } from '../src/utils/json.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

const cases = [
  'bad-node-cli',
  'bad-ts-library',
  'bad-react-app',
  'bad-docs-project',
];

describe('Benchmark suite', () => {
  it('every benchmark case has package.json + known_defects.json', async () => {
    for (const c of cases) {
      const dir = path.join(repoRoot, 'benchmarks', c);
      const pkg = await readJsonSafe(path.join(dir, 'package.json'));
      const def = await readJsonSafe<{ defects: unknown[] }>(path.join(dir, 'known_defects.json'));
      expect(pkg, `pkg missing for ${c}`).not.toBeNull();
      expect(def, `defects missing for ${c}`).not.toBeNull();
      expect(Array.isArray(def!.defects)).toBe(true);
    }
  });

  it('bad-node-cli is detected as raw_demo or working_demo', async () => {
    const analyzer = new AnalyzerAgent();
    const { score, standard_name } = await analyzer.fullAnalyze(
      path.join(repoRoot, 'benchmarks', 'bad-node-cli'),
    );
    expect(score.grade).toMatch(/raw_demo|working_demo/);
    expect(standard_name).toBe('node-cli');
  });

  it('bad-docs-project triggers docs-claim detector heavily', async () => {
    const { runDocsTruth } = await import('../src/core/docsTruth.js');
    const r = await runDocsTruth(path.join(repoRoot, 'benchmarks', 'bad-docs-project'));
    expect(r.missing).toBeGreaterThanOrEqual(3);
  });
});
