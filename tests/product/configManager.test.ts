import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { ConfigManager } from '../../src/product/config/ConfigManager.js';

describe('ConfigManager', () => {
  it('loads defaults when no config exists', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cm-'));
    const cm = new ConfigManager(root);
    const r = await cm.loadEffective();
    expect(r.config.profile).toBe('balanced');
    expect(r.config.schema_version).toBeTruthy();
  });
  it('saves and reloads system config', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cm-'));
    const cm = new ConfigManager(root);
    const cur = await cm.loadEffective();
    cur.config.profile = 'conservative';
    await cm.saveSystem(cur.config);
    const back = await cm.loadEffective();
    expect(back.config.profile).toBe('conservative');
  });
  it('project config overrides system', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cm-'));
    const proj = await fs.mkdtemp(path.join(os.tmpdir(), 'cmproj-'));
    const cm = new ConfigManager(root);
    const sys = await cm.loadEffective();
    sys.config.profile = 'conservative';
    await cm.saveSystem(sys.config);
    const projCfg = { ...sys.config, profile: 'autonomous' };
    await cm.saveProject(proj, projCfg);
    const eff = await cm.loadEffective(proj);
    expect(eff.config.profile).toBe('autonomous');
  });
});
