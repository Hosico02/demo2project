import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { reportMemoryHealth, compactMemory, mergeCases, retireStale } from '../src/qa/QAMemoryHealth.js';
import { QACaseStore } from '../src/qa/QACaseStore.js';
import type { QACase } from '../src/core/types.js';

async function tmp(): Promise<string> {
  return fs.mkdtemp(path.join(tmpdir(), 'd2p-qmh-'));
}
function mk(o: Partial<QACase>): QACase {
  return {
    id: 'qa_x', title: 't', category: 'misc', severity: 'medium', frequency: 1, status: 'active',
    project_type: ['generic'],
    bug_source: { iteration_id: 'i', agent: 'qa', source: 's', related_files: [] },
    trigger_condition: '', human_flow: [], expected_behavior: '', actual_failure: '',
    regression_assertions: [], reproduction_steps: [], suggested_test_type: 'unit',
    fingerprint: 'fp', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    last_seen_at: '2026-01-01T00:00:00.000Z', related_files: [], ...o,
  };
}

describe('QAMemoryHealth', () => {
  it('reports total/active/noisy buckets', async () => {
    const proj = await tmp();
    await new QACaseStore(proj).saveCases([
      mk({ id: 'a', fingerprint: 'a' }),
      mk({ id: 'b', fingerprint: 'b', lifecycle: 'noisy', false_positive_count: 4, true_positive_count: 0 }),
    ]);
    const r = await reportMemoryHealth(proj);
    expect(r.total_cases).toBe(2);
    expect(r.noisy_cases).toBeGreaterThanOrEqual(1);
    expect(r.memory_noise_score).toBeGreaterThan(0);
  });
  it('compactMemory retires noisy + dedupes', async () => {
    const proj = await tmp();
    await new QACaseStore(proj).saveCases([
      mk({ id: 'a', fingerprint: 'shared' }),
      mk({ id: 'b', fingerprint: 'shared' }),
      mk({ id: 'c', fingerprint: 'noisy', lifecycle: 'noisy', false_positive_count: 6 }),
    ]);
    const r = await compactMemory(proj, { applyRetire: true, applyMerge: true });
    expect(r.total_before).toBeGreaterThan(r.total_after);
  });
  it('mergeCases combines two into one', async () => {
    const proj = await tmp();
    await new QACaseStore(proj).saveCases([mk({ id: 'a', fingerprint: 'a' }), mk({ id: 'b', fingerprint: 'b' })]);
    const r = await mergeCases(proj, 'a', 'b');
    expect(r.ok).toBe(true);
    const after = await new QACaseStore(proj).loadCases();
    expect(after.length).toBe(1);
  });
  it('retireStale archives stale cases', async () => {
    const proj = await tmp();
    await new QACaseStore(proj).saveCases([
      mk({ id: 'old', fingerprint: 'old', last_triggered_at: '2010-01-01T00:00:00Z' }),
    ]);
    const r = await retireStale(proj);
    expect(r.retired).toBe(1);
  });
});
