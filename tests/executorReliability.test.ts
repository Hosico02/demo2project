import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { buildReliability, recommendExecutor } from '../src/core/executorReliability.js';

async function tmp(): Promise<string> {
  return fs.mkdtemp(path.join(tmpdir(), 'd2p-er-'));
}

function makeSummary(opts: { id: string; tasks: { id: string; title: string; status: 'completed' | 'failed'; verifs: number; passed: boolean }[] }): object {
  return {
    iteration_id: opts.id,
    project_score_before: { total: 30, grade: 'raw_demo', breakdown: {}, notes: [] },
    project_score_after: { total: 40, grade: 'raw_demo', breakdown: {}, notes: [] },
    project_snapshot: { detected_language: 'typescript' },
    changed_files: [], verification_results: [],
    iteration_plan: { expected_score_delta: 10, iteration_id: opts.id, goal: '', project_path: '', tasks: [], risk_level: 'medium', stop_conditions: [] },
    assigned_tasks: opts.tasks.map((t) => ({ ...t, iteration_id: opts.id, assigned_to: 'executor', description: '', acceptance_criteria: [], expected_changed_files: [], verification_commands: [], priority: 'medium' })),
    executor_results: opts.tasks.map((t) => ({
      task_id: t.id, agent: 'executor', status: t.status, summary: '',
      changed_files: [], commands_run: [],
      verification_evidence: Array.from({ length: t.verifs }, (_, i) => ({ command: `c${i}`, exit_code: t.passed ? 0 : 1, stdout_summary: '', stderr_summary: '', passed: t.passed, duration_ms: 5 })),
      failures: [], risks: [], next_steps: [],
    })),
    qa_cases_created_or_updated: [],
    started_at: '2026-05-12T00:00:00Z', finished_at: '2026-05-12T00:00:01Z',
  };
}

describe('ExecutorReliabilityModel', () => {
  it('aggregates per-provider per-category rows', async () => {
    const proj = await tmp();
    const dir = path.join(proj, '.demo2project', 'iterations');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'a.json'), JSON.stringify(makeSummary({
      id: 'a',
      tasks: [
        { id: 't1', title: 'Author or extend README.md', status: 'completed', verifs: 1, passed: true },
        { id: 't2', title: 'Add CI workflow', status: 'failed', verifs: 1, passed: false },
      ],
    })));
    const rows = await buildReliability(proj);
    expect(rows.length).toBeGreaterThan(0);
    const rec = await recommendExecutor({ projectPath: proj });
    expect(rec.recommended_provider).toBeTruthy();
  });
});
