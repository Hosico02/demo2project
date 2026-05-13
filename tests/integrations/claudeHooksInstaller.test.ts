import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { install, uninstall, status } from '../../src/integrations/claude/ClaudeHooksInstaller.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('ClaudeHooksInstaller', () => {
  it('installs security hooks then uninstalls', async () => {
    const proj = await fs.mkdtemp(path.join(os.tmpdir(), 'chi-'));
    const r = await install(root, proj, 'security');
    expect(r.installed.length).toBeGreaterThan(0);
    const s = await status(proj);
    expect(s.security.installed.length).toBeGreaterThan(0);
    await uninstall(proj, 'security');
    const s2 = await status(proj);
    expect(s2.security.installed.length).toBe(0);
  });
  it('hash_manifest computed for each installed hook', async () => {
    const proj = await fs.mkdtemp(path.join(os.tmpdir(), 'chi-'));
    const r = await install(root, proj, 'baseline');
    expect(Object.keys(r.hash_manifest).length).toBe(r.installed.length);
  });
});
