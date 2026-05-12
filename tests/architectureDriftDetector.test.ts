import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { takeArchSnapshot, compareSnapshots } from '../src/core/architectureDrift.js';

async function mkProj(files: Record<string, string>): Promise<string> {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-drift-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content);
  }
  return dir;
}

describe('ArchitectureDriftDetector', () => {
  it('reports no drift between identical snapshots', async () => {
    const dir = await mkProj({ 'package.json': JSON.stringify({ name: 'x' }), 'src/a.ts': 'x\n' });
    const a = await takeArchSnapshot(dir);
    const b = await takeArchSnapshot(dir);
    const r = compareSnapshots(a, b);
    expect(r.drift_score).toBeLessThanOrEqual(2);
  });
  it('flags file_count_explosion', async () => {
    const base = await mkProj({ 'package.json': JSON.stringify({ name: 'x' }), 'src/a.ts': 'x\n' });
    const grown = await mkProj({
      'package.json': JSON.stringify({ name: 'x' }),
      'src/a.ts': 'x\n',
      ...Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`new/file${i}.ts`, '']))
    });
    const a = await takeArchSnapshot(base);
    const b = await takeArchSnapshot(grown);
    const r = compareSnapshots(a, b);
    expect(r.drift_findings.some((f) => f.detector === 'file_count_explosion')).toBe(true);
  });
  it('flags dependency_bloat', async () => {
    const a = await takeArchSnapshot(await mkProj({ 'package.json': JSON.stringify({ name: 'x' }) }));
    const b = await takeArchSnapshot(await mkProj({
      'package.json': JSON.stringify({
        name: 'x',
        dependencies: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`d${i}`, '^1'])),
      }),
    }));
    const r = compareSnapshots(a, b);
    expect(r.drift_findings.some((f) => f.detector === 'dependency_bloat')).toBe(true);
  });
});
