import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { SupervisorAgent } from '../src/agents/SupervisorAgent.js';
import { MockAgentProvider } from '../src/agents/providers/MockAgentProvider.js';

async function tmpDemo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-sup-'));
  await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'demo', main: 'app.js' }, null, 2));
  await fs.writeFile(path.join(dir, 'app.js'), 'console.log("hi");\n');
  return dir;
}

describe('SupervisorAgent.iterate', () => {
  let demo: string;
  beforeEach(async () => { demo = await tmpDemo(); });

  it('runs a single iteration and produces a summary with before/after scores', async () => {
    const sup = new SupervisorAgent();
    const summaries = await sup.iterate({
      projectPath: demo,
      goal: 'project-ready',
      provider: new MockAgentProvider('happy'),
      maxIterations: 1,
    });
    expect(summaries.length).toBe(1);
    const s = summaries[0]!;
    expect(s.assigned_tasks.length).toBeGreaterThan(0);
    expect(s.executor_results.length).toBe(s.assigned_tasks.length);
    expect(s.project_score_before.total).toBeGreaterThanOrEqual(0);
    expect(s.project_score_after.total).toBeGreaterThanOrEqual(0);
  });

  it('refuses to mark a change-without-verify task as completed', async () => {
    const sup = new SupervisorAgent();
    const summaries = await sup.iterate({
      projectPath: demo,
      goal: 'project-ready',
      provider: new MockAgentProvider('change_without_verify'),
      maxIterations: 1,
    });
    const s = summaries[0]!;
    const completed = s.executor_results.filter((r) => r.status === 'completed');
    expect(completed.length).toBe(0);
    expect(s.qa_cases_created_or_updated.length).toBeGreaterThan(0);
    expect(s.reviewer_findings.some((f) => /missing_validation_after_code_change/.test(f))).toBe(true);
  });

  it('accepts change_with_unable_reason as a documented non-verification', async () => {
    const sup = new SupervisorAgent();
    const summaries = await sup.iterate({
      projectPath: demo,
      goal: 'project-ready',
      provider: new MockAgentProvider('change_with_unable_reason'),
      maxIterations: 1,
    });
    const s = summaries[0]!;
    const flagged = s.reviewer_findings.filter((f) => /missing_validation_after_code_change/.test(f));
    expect(flagged.length).toBe(0);
  });
});
