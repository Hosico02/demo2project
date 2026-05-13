import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { loadConfig, saveConfig, DEFAULT_CONFIG } from '../../src/governance/enterprise/EnterpriseGovernanceConfig.js';

describe('EnterpriseGovernanceConfig', () => {
  it('loads default and persists changes', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'egc-'));
    const c = await loadConfig(root);
    expect(c.team_name).toBe(DEFAULT_CONFIG.team_name);
    c.team_name = 'acme';
    await saveConfig(root, c);
    const back = await loadConfig(root);
    expect(back.team_name).toBe('acme');
  });
});
