import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { SupervisorAgent } from '../src/agents/SupervisorAgent.js';
import type { AgentProvider, AgentContext } from '../src/agents/providers/AgentProvider.js';
import type { AgentResult, AgentTask } from '../src/core/types.js';

async function mkPythonDemo() {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-repair-loop-'));
  await fs.writeFile(path.join(dir, 'README.md'), '# Demo\n\n' + 'x'.repeat(420));
  await fs.writeFile(path.join(dir, '.gitignore'), '.env\n');
  await fs.writeFile(path.join(dir, 'pyproject.toml'), '[project]\nname = "repair-loop-demo"\n');
  await fs.writeFile(path.join(dir, 'requirements.txt'), 'pytest>=8\n');
  await fs.writeFile(path.join(dir, 'app.py'), 'def ok():\n    return True\n');
  return dir;
}

class FailingThenRepairingProvider implements AgentProvider {
  readonly name = 'failing-then-repairing';

  async runTask(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
    if (/Repair failed verification/.test(task.title)) {
      await fs.writeFile(path.join(ctx.project_path, 'tests', 'test_smoke.py'), 'def test_smoke():\n    assert True\n');
      return result(task, 'completed', 'repair made pytest pass', ['tests/test_smoke.py']);
    }
    await fs.mkdir(path.join(ctx.project_path, 'tests'), { recursive: true });
    await fs.writeFile(path.join(ctx.project_path, 'tests', 'test_smoke.py'), 'def test_smoke():\n    assert False\n');
    return result(task, 'failed', 'introduced failing pytest smoke test', ['tests/test_smoke.py']);
  }
}

function result(task: AgentTask, status: AgentResult['status'], summary: string, changed: string[]): AgentResult {
  return {
    task_id: task.id,
    agent: 'executor',
    status,
    summary,
    changed_files: changed,
    commands_run: task.verification_commands,
    verification_evidence: [],
    failures: status === 'failed' ? ['simulated provider failure'] : [],
    risks: [],
    next_steps: [],
  };
}

describe('failed verification repair loop', () => {
  it('creates and runs a repair task before continuing ordinary gap work', async () => {
    const project = await mkPythonDemo();
    const summaries = await new SupervisorAgent().iterate({
      projectPath: project,
      goal: 'project-ready',
      provider: new FailingThenRepairingProvider(),
      maxIterations: 1,
    });

    const summary = summaries[0]!;
    expect(summary.assigned_tasks.map((t) => t.title)).toContain('Repair failed verification: python3 -m pytest -q');
    expect(summary.executor_results.some((r) => r.summary === 'repair made pytest pass' && r.status === 'completed')).toBe(true);
    expect(summary.verification_results.some((r) => r.command === 'python3 -m pytest -q' && r.passed)).toBe(true);
    expect(summary.assigned_tasks.findIndex((t) => /Repair failed verification/.test(t.title))).toBe(1);
  });
});
