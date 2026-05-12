import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { bisect, recommendRollback } from '../src/core/regressionBisector.js';

async function tmp(): Promise<string> {
  return fs.mkdtemp(path.join(tmpdir(), 'd2p-rb-'));
}

function summary(opts: { id: string; before: number; after: number; passed: boolean; startedAt: string }): object {
  return {
    iteration_id: opts.id,
    project_score_before: { total: opts.before, grade: 'raw_demo', breakdown: {}, notes: [] },
    project_score_after: { total: opts.after, grade: 'raw_demo', breakdown: {}, notes: [] },
    changed_files: ['app.js'],
    verification_results: opts.passed ? [{ command: 'echo ok', exit_code: 0, stdout_summary: '', stderr_summary: '', passed: true, duration_ms: 1 }] : [{ command: 'echo bad', exit_code: 1, stdout_summary: '', stderr_summary: '', passed: false, duration_ms: 1, failure_reason: 'exit_code_1' }],
    assigned_tasks: [],
    executor_results: [],
    qa_cases_created_or_updated: [],
    started_at: opts.startedAt,
    finished_at: opts.startedAt,
  };
}

describe('RegressionBisector', () => {
  it('returns no_rollback when no drop', async () => {
    const proj = await tmp();
    const dir = path.join(proj, '.demo2project', 'iterations');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'a.json'), JSON.stringify(summary({ id: 'a', before: 30, after: 40, passed: true, startedAt: '2026-05-12T00:00:01Z' })));
    await fs.writeFile(path.join(dir, 'b.json'), JSON.stringify(summary({ id: 'b', before: 40, after: 50, passed: true, startedAt: '2026-05-12T00:00:02Z' })));
    const r = await bisect(proj);
    expect(r.rollback_recommendation).toBe('no_rollback');
  });
  it('identifies the introducing iteration on score drop', async () => {
    const proj = await tmp();
    const dir = path.join(proj, '.demo2project', 'iterations');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'a.json'), JSON.stringify(summary({ id: 'a', before: 30, after: 50, passed: true, startedAt: '2026-05-12T00:00:01Z' })));
    await fs.writeFile(path.join(dir, 'b.json'), JSON.stringify(summary({ id: 'b', before: 50, after: 30, passed: false, startedAt: '2026-05-12T00:00:02Z' })));
    const r = await bisect(proj);
    expect(r.suspected_introducing_iteration).toBe('b');
    expect(r.rollback_recommendation).toBe('rollback_to_previous_iteration');
  });
  it('recommendRollback returns target iteration', async () => {
    const proj = await tmp();
    const dir = path.join(proj, '.demo2project', 'iterations');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'a.json'), JSON.stringify(summary({ id: 'a', before: 30, after: 50, passed: true, startedAt: '2026-05-12T00:00:01Z' })));
    await fs.writeFile(path.join(dir, 'b.json'), JSON.stringify(summary({ id: 'b', before: 50, after: 30, passed: false, startedAt: '2026-05-12T00:00:02Z' })));
    const r = await recommendRollback(proj);
    expect(r.ok).toBe(true);
    expect(r.rollback_target_iteration).toBe('a');
  });
});
