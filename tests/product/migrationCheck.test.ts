import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { status, run } from '../../src/product/release/MigrationManager.js';

describe('Migration check', () => {
  it('reports no migration needed for fresh state', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-'));
    const s = await status(root);
    expect(s.needs_migration).toBe(false);
  });
  it('dry-run migrate returns report without applying', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-'));
    const r = await run(root, undefined, { dryRun: true });
    expect(r.applied).toBe(false);
  });
  it('apply migration writes config', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-'));
    const r = await run(root);
    expect(r.applied).toBe(true);
  });
});
