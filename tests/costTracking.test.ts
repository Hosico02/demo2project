import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { CostTracker } from '../src/core/costTracker.js';

async function tmp() { return fs.mkdtemp(path.join(tmpdir(), 'd2p-cost-')); }

describe('CostTracker', () => {
  it('records command counts and produces an estimate', () => {
    const ct = new CostTracker('iter_x');
    ct.addCommand(10, 100);
    ct.addCommand(20, 200);
    ct.noteRetry();
    const r = ct.finalize({ score_delta: 5, defects_fixed: 2 });
    expect(r.command_count).toBe(2);
    expect(r.retry_count).toBe(1);
    expect(r.token_estimate).toBe(300);
    expect(r.cost_estimate_usd).toBeGreaterThanOrEqual(0);
    expect(r.cost_per_score_point).toBeDefined();
    expect(r.cost_per_fixed_defect).toBeDefined();
  });

  it('persists and re-reads cost records', async () => {
    const proj = await tmp();
    const ct = new CostTracker('iter_y');
    ct.addCommand(1, 1);
    const r = ct.finalize();
    await CostTracker.persist(proj, r);
    const all = await CostTracker.readAll(proj);
    expect(all.length).toBe(1);
    expect(all[0]!.iteration_id).toBe('iter_y');
  });
});
