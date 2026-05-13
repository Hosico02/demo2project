import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { loadFromDir } from '../../src/extensions/ExtensionLoader.js';

describe('ExtensionLoader failure handling', () => {
  it('returns null when manifest missing', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'el-'));
    const r = await loadFromDir(dir);
    expect(r).toBeNull();
  });
  it('captures import error instead of throwing', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'el-'));
    await fs.writeFile(path.join(dir, 'demo2project.extension.json'), JSON.stringify({
      name: 'b', version: '1', author: 'a', type: 'policy_rule', entry: 'index.js',
      permissions_required: [], supported_demo2project_versions: [], description: '', risk_level: 'low',
    }));
    await fs.writeFile(path.join(dir, 'index.js'), 'this is not js );');
    const r = await loadFromDir(dir);
    expect(r).not.toBeNull();
    expect(r!.error).toBeTruthy();
  });
});
