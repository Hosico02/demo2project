import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { takeSnapshot } from '../src/core/projectSnapshot.js';
import { scoreProjectWithEvidence } from '../src/core/evidenceWeightedScorer.js';
import { scoreProject } from '../src/core/projectScorer.js';
import { selectStandardForSnapshot } from '../src/standards/standardsLibrary.js';

async function mk(files: Record<string, string>) {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-gm-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content);
  }
  return dir;
}

describe('Score gaming prevention', () => {
  it('a gamed project (empty README + empty CI + lies) scores lower under evidence-weighted', async () => {
    // Gamed: README claims many commands; no scripts; CI exists but is empty
    const proj = await mk({
      'README.md': '## Run\n\n```bash\nnpm test\nnpm run build\ndocker build .\n```\n\nCI runs on push.\n',
      'package.json': JSON.stringify({ name: 'x' }),
      '.github/workflows/ci.yml': 'name: CI\non: [push]\njobs: {}\n',
    });
    const snap = await takeSnapshot(proj);
    const { standard } = await selectStandardForSnapshot(snap);
    const naive = await scoreProject(snap, standard);
    const evidenced = await scoreProjectWithEvidence(snap, standard);
    expect(evidenced.total).toBeLessThan(naive.total);
    expect(evidenced.notes.length).toBeGreaterThan(naive.notes.length);
  });

  it('an honest project (README matches scripts) is NOT penalized by evidence weighting', async () => {
    const proj = await mk({
      'README.md': '## Run\n\n```bash\nnpm test\n```\n',
      'package.json': JSON.stringify({ name: 'x', scripts: { test: 'node --test tests' } }),
      'tests/x.test.mjs': "import { test } from 'node:test'; test('t', () => {});",
    });
    const snap = await takeSnapshot(proj);
    const { standard } = await selectStandardForSnapshot(snap);
    const naive = await scoreProject(snap, standard);
    const evidenced = await scoreProjectWithEvidence(snap, standard);
    // small unverified-test penalty applied since we don't run the command,
    // but no docs_lie penalty
    expect(naive.total - evidenced.total).toBeLessThanOrEqual(8);
    expect(evidenced.notes.some((n) => /docs penalty/.test(n))).toBe(false);
  });
});
