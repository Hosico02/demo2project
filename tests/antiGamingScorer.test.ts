import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { takeSnapshot } from '../src/core/projectSnapshot.js';
import { runAntiGaming } from '../src/core/antiGamingScorer.js';

async function mk(files: Record<string, string>) {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-ag-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content);
  }
  return dir;
}

describe('Anti-gaming detectors', () => {
  it('detects empty test files', async () => {
    const dir = await mk({
      'package.json': JSON.stringify({ name: 'x', scripts: { test: 'node --test tests' } }),
      'tests/empty.test.mjs': '',
    });
    const snap = await takeSnapshot(dir);
    const f = await runAntiGaming(snap);
    expect(f.some((x) => x.detector === 'empty_test_file')).toBe(true);
  });

  it('detects tautological assertions', async () => {
    const dir = await mk({
      'package.json': JSON.stringify({ name: 'x', scripts: { test: 'vitest run' } }),
      'tests/x.test.js': "import { it, expect } from 'vitest'; it('x', () => { expect(true).toBe(true); });",
    });
    const snap = await takeSnapshot(dir);
    const f = await runAntiGaming(snap);
    expect(f.some((x) => x.detector === 'sham_test_assertion')).toBe(true);
  });

  it('detects echo-only build scripts', async () => {
    const dir = await mk({
      'package.json': JSON.stringify({ name: 'x', scripts: { build: "echo built" } }),
    });
    const snap = await takeSnapshot(dir);
    const f = await runAntiGaming(snap);
    expect(f.some((x) => x.detector === 'no_op_script')).toBe(true);
  });

  it('detects fake CI (no real runner invocation)', async () => {
    const dir = await mk({
      'package.json': JSON.stringify({ name: 'x' }),
      '.github/workflows/ci.yml': 'name: CI\non: [push]\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo "ok"\n',
    });
    const snap = await takeSnapshot(dir);
    const f = await runAntiGaming(snap);
    expect(f.some((x) => x.detector === 'fake_ci')).toBe(true);
  });

  it('detects secret-shaped patterns in source', async () => {
    const dir = await mk({
      'package.json': JSON.stringify({ name: 'x' }),
      'src/leak.js': 'const KEY = "AKIAABCDEFGHIJKLMNOP";',
    });
    const snap = await takeSnapshot(dir);
    const f = await runAntiGaming(snap);
    expect(f.some((x) => x.detector === 'forbidden_pattern_in_source')).toBe(true);
  });
});
