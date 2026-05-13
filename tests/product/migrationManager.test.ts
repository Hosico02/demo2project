import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { status, run } from '../../src/product/release/MigrationManager.js';

describe('MigrationManager', () => {
  it('status reports schema version', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mm-'));
    const s = await status(root);
    expect(s.to).toBe('0.0.8');
  });
  it('apply writes a backup when target existed', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mm-'));
    const proj = await fs.mkdtemp(path.join(os.tmpdir(), 'mmp-'));
    await fs.mkdir(path.join(proj, '.demo2project'), { recursive: true });
    await fs.writeFile(path.join(proj, '.demo2project', 'config.json'), JSON.stringify({ schema_version: '0.0.7' }));
    const r = await run(root, proj);
    expect(r.applied).toBe(true);
    expect(r.backup_path).toBeTruthy();
  });
});
