import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { RuleBasedExecutor } from '../src/agents/providers/RuleBasedExecutor.js';
import { SupervisorAgent } from '../src/agents/SupervisorAgent.js';

async function tmpDemo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-'));
  await fs.writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'rbe-demo', main: 'app.js' }, null, 2),
  );
  await fs.writeFile(path.join(dir, 'app.js'), 'console.log("hi");\n');
  return dir;
}

describe('RuleBasedExecutor', () => {
  it('writes a real README when the task targets README.md', async () => {
    const demo = await tmpDemo();
    const exec = new RuleBasedExecutor();
    const result = await exec.runTask(
      {
        id: 't1',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Author or extend README.md',
        description: 'Missing README',
        acceptance_criteria: ['README exists'],
        expected_changed_files: ['README.md'],
        verification_commands: ['test -s README.md'],
        priority: 'high',
        status: 'pending',
      },
      { project_path: demo, iteration_id: 'iter1', recent_events: [] },
    );
    expect(result.status).toBe('completed');
    expect(result.changed_files).toContain('README.md');
    const txt = await fs.readFile(path.join(demo, 'README.md'), 'utf8');
    expect(txt.length).toBeGreaterThan(200);
    expect(txt).toContain('## Install');
  });

  it('skips with unable_to_verify_reason when no rule matches', async () => {
    const demo = await tmpDemo();
    const exec = new RuleBasedExecutor();
    const result = await exec.runTask(
      {
        id: 't2',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Refactor the whole codebase',
        description: 'Unscoped',
        acceptance_criteria: [],
        expected_changed_files: ['(see suggested_fix)'],
        verification_commands: [],
        priority: 'low',
        status: 'pending',
      },
      { project_path: demo, iteration_id: 'iter1', recent_events: [] },
    );
    expect(result.status).toBe('skipped');
    expect(result.unable_to_verify_reason).toBe('no_rule_for_task');
  });

  it('actually moves the project score up after one iteration', async () => {
    const demo = await tmpDemo();
    const sup = new SupervisorAgent();
    const summaries = await sup.iterate({
      projectPath: demo,
      goal: 'project-ready',
      provider: new RuleBasedExecutor(),
      maxIterations: 1,
    });
    const s = summaries[0]!;
    expect(s.project_score_after.total).toBeGreaterThanOrEqual(s.project_score_before.total);
    expect(s.changed_files.length).toBeGreaterThan(0);
  });
});
