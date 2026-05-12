import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { QualityTrendMonitor, snapshotFromBasics } from '../src/core/qualityTrendMonitor.js';

async function tmpProj(): Promise<string> {
  return fs.mkdtemp(path.join(tmpdir(), 'd2p-qtm-'));
}

describe('QualityTrendMonitor', () => {
  it('persists snapshots and reloads them', async () => {
    const proj = await tmpProj();
    const m = new QualityTrendMonitor(proj, 'sess1');
    await m.append(snapshotFromBasics({ iterationId: 'a', projectScore: 40 }));
    await m.append(snapshotFromBasics({ iterationId: 'b', projectScore: 42 }));
    const all = await m.load();
    expect(all.length).toBe(2);
  });
  it('decides rollback on score drop', async () => {
    const proj = await tmpProj();
    const m = new QualityTrendMonitor(proj, 'sess2');
    const seq = [
      snapshotFromBasics({ iterationId: 'a', projectScore: 50 }),
      snapshotFromBasics({ iterationId: 'b', projectScore: 30, regressionCount: 1 }),
    ];
    const d = m.decide(seq, {
      score_window_size: 2,
      min_score_improvement_per_window: 0,
      max_regressions_allowed: 0,
      rollback_on_score_drop: true,
    });
    expect(d.kind).toBe('rollback');
  });
  it('decides stop on plateau', async () => {
    const proj = await tmpProj();
    const m = new QualityTrendMonitor(proj, 'sess3');
    const seq = [
      snapshotFromBasics({ iterationId: 'a', projectScore: 50 }),
      snapshotFromBasics({ iterationId: 'b', projectScore: 50 }),
      snapshotFromBasics({ iterationId: 'c', projectScore: 50 }),
    ];
    const d = m.decide(seq, {
      score_window_size: 3,
      min_score_improvement_per_window: 2,
      max_regressions_allowed: 5,
      rollback_on_score_drop: false,
    });
    expect(d.kind).toBe('stop');
  });
  it('continues when within bounds', async () => {
    const proj = await tmpProj();
    const m = new QualityTrendMonitor(proj, 'sess4');
    const seq = [
      snapshotFromBasics({ iterationId: 'a', projectScore: 40 }),
      snapshotFromBasics({ iterationId: 'b', projectScore: 45 }),
    ];
    const d = m.decide(seq, {
      score_window_size: 3,
      min_score_improvement_per_window: 0,
      max_regressions_allowed: 5,
      rollback_on_score_drop: false,
    });
    expect(d.kind).toBe('continue');
  });
});
