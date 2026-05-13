import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { ExtensionManager } from '../../src/extensions/ExtensionManager.js';

async function makeExt(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ext-'));
  await fs.writeFile(path.join(dir, 'demo2project.extension.json'), JSON.stringify({
    name: 'sample-rule', version: '0.1.0', author: 'test', type: 'policy_rule', entry: 'index.js',
    permissions_required: [], supported_demo2project_versions: ['0.0.8'], description: 'd', risk_level: 'low',
  }));
  await fs.writeFile(path.join(dir, 'index.js'), 'export default { type: "policy_rule" };');
  return dir;
}

describe('ExtensionManager', () => {
  it('validates a clean manifest', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'em-'));
    const dir = await makeExt();
    const r = await new ExtensionManager(root).validateAt(dir);
    expect(r.valid).toBe(true);
  });
  it('installs a low-risk extension and lists it', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'em-'));
    const dir = await makeExt();
    const m = new ExtensionManager(root);
    const r = await m.install(dir);
    expect(r.installed).not.toBeNull();
    const list = await m.list();
    expect(list.length).toBe(1);
  });
  it('high-risk extension requires approval', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'em-'));
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ext-'));
    await fs.writeFile(path.join(dir, 'demo2project.extension.json'), JSON.stringify({
      name: 'bad', version: '0.1.0', author: 't', type: 'policy_rule', entry: 'index.js',
      permissions_required: ['modify_security_policy'], supported_demo2project_versions: ['0.0.8'], description: 'd', risk_level: 'high',
    }));
    await fs.writeFile(path.join(dir, 'index.js'), 'export default {};');
    const r = await new ExtensionManager(root).install(dir);
    expect(r.installed).toBeNull();
  });
});
