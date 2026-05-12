import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { calibratePlanner, calibrationReport, explainCategory } from '../src/core/plannerCalibration.js';

async function tmp(): Promise<string> {
  return fs.mkdtemp(path.join(tmpdir(), 'd2p-pc-'));
}
function summary(opts: { id: string; before: number; after: number; tasks: { id: string; title: string; priority: string; status: string }[] }): object {
  return {
    iteration_id: opts.id,
    project_score_before: { total: opts.before, grade: 'raw_demo', breakdown: {}, notes: [] },
    project_score_after: { total: opts.after, grade: 'raw_demo', breakdown: {}, notes: [] },
    changed_files: [],
    verification_results: [],
    iteration_plan: { expected_score_delta: 6, iteration_id: opts.id, goal: 'g', project_path: '', tasks: [], risk_level: 'medium', stop_conditions: [] },
    assigned_tasks: opts.tasks.map((t) => ({ ...t, iteration_id: opts.id, assigned_to: 'executor', description: '', acceptance_criteria: [], expected_changed_files: [], verification_commands: [] })),
    executor_results: opts.tasks.map((t) => ({ task_id: t.id, agent: 'executor', status: t.status, summary: '', changed_files: [], commands_run: [], verification_evidence: [], failures: [], risks: [], next_steps: [] })),
    qa_cases_created_or_updated: [],
    started_at: '2026-05-12T00:00:00Z', finished_at: '2026-05-12T00:00:01Z',
  };
}

describe('PlannerCalibrationEngine', () => {
  it('records calibration entries from iteration summaries', async () => {
    const proj = await tmp();
    const dir = path.join(proj, '.demo2project', 'iterations');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'a.json'), JSON.stringify(summary({
      id: 'a', before: 30, after: 45,
      tasks: [{ id: 't1', title: 'Author or extend README.md', priority: 'high', status: 'completed' }],
    })));
    const r = await calibratePlanner(proj);
    expect(r.added).toBeGreaterThan(0);
    const rep = await calibrationReport(proj);
    expect(rep.total).toBeGreaterThan(0);
    const cat = await explainCategory(proj, 'docs/readme');
    expect(cat.records.length).toBeGreaterThan(0);
  });
});
