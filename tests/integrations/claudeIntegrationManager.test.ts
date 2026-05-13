import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setup } from '../../src/integrations/claude/ClaudeIntegrationManager.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('ClaudeIntegrationManager', () => {
  it('dry-run setup writes nothing', async () => {
    const proj = await fs.mkdtemp(path.join(os.tmpdir(), 'cim-'));
    const r = await setup(root, proj, { dryRun: true, useSecurityHooks: true });
    expect(r.baseline_install.dry_run).toBe(true);
    expect(r.settings_written).toBe('');
  });
  it('apply installs baseline + security hooks + settings', async () => {
    const proj = await fs.mkdtemp(path.join(os.tmpdir(), 'cim-'));
    const r = await setup(root, proj, { useSecurityHooks: true });
    expect(r.baseline_install.installed.length).toBeGreaterThan(0);
    expect(r.security_install.installed.length).toBeGreaterThan(0);
    expect(r.settings_written).toContain('.claude');
  });
});
