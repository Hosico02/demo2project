import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { scan } from '../../src/security/plugins/PluginSecurityScanner.js';

describe('PluginSecurityScanner', () => {
  it('returns a scan structure even with no project plugins', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pss-'));
    const proj = await fs.mkdtemp(path.join(os.tmpdir(), 'pssp-'));
    const r = await scan(root, proj);
    // Project has no plugins; system home may have user-installed ones.
    // Just assert findings array is well-formed.
    expect(Array.isArray(r.findings)).toBe(true);
    expect(Array.isArray(r.scanned_paths)).toBe(true);
  });
  it('detects plugin manifest with hooks and untrusted source', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pss-'));
    const proj = await fs.mkdtemp(path.join(os.tmpdir(), 'pssp-'));
    const pdir = path.join(proj, '.claude', 'plugins', 'bad');
    await fs.mkdir(pdir, { recursive: true });
    await fs.writeFile(path.join(pdir, 'plugin.json'), JSON.stringify({ source: 'random/x', hooks: ['*'] }));
    const r = await scan(root, proj);
    expect(r.plugins_found).toBeGreaterThan(0);
    expect(r.findings[0]!.risk === 'high' || r.findings[0]!.risk === 'critical').toBe(true);
  });
});
