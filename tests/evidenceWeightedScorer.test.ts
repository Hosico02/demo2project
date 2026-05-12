import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { takeSnapshot } from '../src/core/projectSnapshot.js';
import { scoreProjectWithEvidence } from '../src/core/evidenceWeightedScorer.js';
import { selectStandardForSnapshot } from '../src/standards/standardsLibrary.js';

async function mk(files: Record<string, string>) {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-ew-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content);
  }
  return dir;
}

describe('Evidence-weighted scoring', () => {
  it('penalizes README claims without matching scripts', async () => {
    const proj = await mk({
      'README.md': '## Run\n\n```bash\npnpm test\npnpm build\ndocker build .\n```\n',
      'package.json': JSON.stringify({ name: 'x', scripts: { start: 'echo' } }),
    });
    const snap = await takeSnapshot(proj);
    const { standard } = await selectStandardForSnapshot(snap);
    const score = await scoreProjectWithEvidence(snap, standard);
    const docsEv = score.score_evidence!.find((e) => e.dimension === 'docs_score')!;
    expect(docsEv.verified).toBe(false);
    expect(docsEv.notes ?? '').toMatch(/unverified|missing/i);
    expect(score.notes.some((n) => /docs penalty/.test(n))).toBe(true);
  });

  it('emits a score_evidence array of expected dimensions', async () => {
    const proj = await mk({ 'package.json': JSON.stringify({ name: 'x' }) });
    const snap = await takeSnapshot(proj);
    const { standard } = await selectStandardForSnapshot(snap);
    const score = await scoreProjectWithEvidence(snap, standard);
    const dims = new Set(score.score_evidence!.map((e) => e.dimension));
    expect(dims.has('docs_score')).toBe(true);
    expect(dims.has('test_score')).toBe(true);
    expect(dims.has('build_score')).toBe(true);
    expect(dims.has('safety_score')).toBe(true);
  });

  it('flags unverified test command when runCommands=false (default)', async () => {
    const proj = await mk({
      'package.json': JSON.stringify({ name: 'x', scripts: { test: 'echo ok' } }),
    });
    const snap = await takeSnapshot(proj);
    const { standard } = await selectStandardForSnapshot(snap);
    const score = await scoreProjectWithEvidence(snap, standard);
    const tev = score.score_evidence!.find((e) => e.dimension === 'test_score')!;
    expect(tev.claimed).toBe(true);
    expect(tev.verified).toBe(false);
    expect(tev.result).toBe('unrun');
  });
});
