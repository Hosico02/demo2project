import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { runDocsTruth } from '../src/core/docsTruth.js';

async function mkProject(files: Record<string, string>): Promise<string> {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-docs-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content);
  }
  return dir;
}

describe('DocsTruthChecker', () => {
  it('flags pnpm test claim when no test script exists', async () => {
    const dir = await mkProject({
      'README.md': '# X\n\nRun:\n\n```bash\npnpm test\n```\n',
      'package.json': JSON.stringify({ name: 'x' }),
    });
    const r = await runDocsTruth(dir);
    expect(r.missing).toBeGreaterThan(0);
    expect(r.results.some((x) => x.kind === 'script' && x.detail === 'test' && x.evidence === 'missing')).toBe(true);
  });

  it('marks pnpm test as present when script exists', async () => {
    const dir = await mkProject({
      'README.md': '# X\n\n```bash\npnpm test\n```\n',
      'package.json': JSON.stringify({ name: 'x', scripts: { test: 'echo ok' } }),
    });
    const r = await runDocsTruth(dir);
    const claim = r.results.find((x) => x.kind === 'script' && x.detail === 'test');
    expect(claim?.evidence).toBe('present');
  });

  it('flags docker claim without Dockerfile', async () => {
    const dir = await mkProject({
      'README.md': '## Deploy\n\nRun `docker build .` then `docker run myimg`.',
    });
    const r = await runDocsTruth(dir);
    expect(r.results.some((x) => x.kind === 'docker' && x.evidence === 'missing')).toBe(true);
  });

  it('flags CI claim without workflow files', async () => {
    const dir = await mkProject({
      'README.md': 'We use GitHub Actions for CI.',
    });
    const r = await runDocsTruth(dir);
    expect(r.results.some((x) => x.kind === 'ci' && x.evidence === 'missing')).toBe(true);
  });
});
