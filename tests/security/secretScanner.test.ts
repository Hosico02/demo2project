import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { scanProject, scanText } from '../../src/security/secrets/SecretScanner.js';

describe('SecretScanner', () => {
  it('detects AWS-style key', async () => {
    const r = await scanText('FOO=AKIAIOSFODNN7EXAMPLE');
    expect(r.findings.length).toBeGreaterThan(0);
    expect(r.findings[0]!.type).toBe('api_key');
  });
  it('detects GitHub token', async () => {
    const r = await scanText('GH_TOKEN=ghp_' + 'A'.repeat(36));
    expect(r.findings.some((f) => f.type === 'access_token')).toBe(true);
  });
  it('scans project files', async () => {
    const d = await fs.mkdtemp(path.join(os.tmpdir(), 'sec-'));
    await fs.writeFile(path.join(d, '.env'), 'API_KEY=' + 'x'.repeat(32));
    const r = await scanProject(d);
    expect(r.findings.length).toBeGreaterThan(0);
  });
  it('high-risk secrets bumped exposure_risk', async () => {
    const r = await scanText('TOKEN=ghp_' + 'B'.repeat(36));
    expect(r.findings[0]!.exposure_risk).toBe('high');
  });
});
