import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { deleteSession, cleanupByRetention } from '../../src/privacy/DataDeletion.js';

describe('DataDeletion', () => {
  it('removes session files', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dd-'));
    const proj = await fs.mkdtemp(path.join(os.tmpdir(), 'ddproj-'));
    const sid = 'sess_xyz';
    await fs.mkdir(path.join(proj, '.demo2project', 'sessions'), { recursive: true });
    await fs.writeFile(path.join(proj, '.demo2project', 'sessions', `${sid}.json`), '{}');
    const r = await deleteSession(root, proj, sid);
    expect(r.removed_files.length).toBeGreaterThan(0);
  });
  it('cleanupByRetention returns a report', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dd-'));
    const r = await cleanupByRetention(root);
    expect(Array.isArray(r.removed_files)).toBe(true);
  });
});
