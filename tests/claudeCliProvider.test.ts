import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { ClaudeCodeProvider } from '../src/agents/providers/ClaudeCodeProvider.js';
import type { AgentTask } from '../src/core/types.js';

async function tmp() {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-cli-'));
  await fs.writeFile(path.join(dir, 'package.json'), '{}');
  return dir;
}

const task: AgentTask = {
  id: 't_cli',
  iteration_id: 'i_cli',
  assigned_to: 'executor',
  title: 'Author or extend README.md',
  description: 'add a README',
  acceptance_criteria: ['README exists'],
  expected_changed_files: ['README.md'],
  verification_commands: ['test -s README.md'],
  priority: 'medium',
  status: 'pending',
};

describe('ClaudeCliProvider — adapter contract', () => {
  it('defaults to disabled and returns skipped with provider_not_enabled', async () => {
    const dir = await tmp();
    const p = new ClaudeCodeProvider({ enabled: false });
    const r = await p.runTask(task, { project_path: dir, iteration_id: 'i_cli', recent_events: [] });
    expect(r.status).toBe('skipped');
    expect(r.unable_to_verify_reason).toBe('provider_not_enabled');
    expect(r.changed_files).toEqual([]);
  });

  it('when enabled but binary missing, returns failed with claude_subprocess_error', async () => {
    const dir = await tmp();
    const p = new ClaudeCodeProvider({
      enabled: true,
      binary: '/definitely/not/a/real/claude/binary',
      timeoutMs: 3000,
    });
    const r = await p.runTask(task, { project_path: dir, iteration_id: 'i_cli', recent_events: [] });
    expect(r.status).toBe('failed');
    expect(r.failures.some((f) => /claude_subprocess_error/.test(f))).toBe(true);
  });

  it('contract: always returns an AgentResult shape (never throws)', async () => {
    const dir = await tmp();
    const p = new ClaudeCodeProvider({ enabled: true, binary: '/no/such/bin', timeoutMs: 3000 });
    const r = await p.runTask(task, { project_path: dir, iteration_id: 'i_cli', recent_events: [] });
    expect(r.task_id).toBe(task.id);
    expect(Array.isArray(r.changed_files)).toBe(true);
    expect(Array.isArray(r.verification_evidence)).toBe(true);
  });
});
