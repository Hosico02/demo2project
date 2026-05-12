import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { SupervisorAgent } from '../src/agents/SupervisorAgent.js';
import type { AgentProvider, AgentContext } from '../src/agents/providers/AgentProvider.js';
import type { AgentTask, AgentResult } from '../src/core/types.js';

/**
 * Provider isolation: Supervisor must drive any provider that implements
 * the AgentProvider interface, without referencing the concrete class.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

async function tmpDemo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-iso-'));
  await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'iso' }));
  return dir;
}

class CountingProvider implements AgentProvider {
  readonly name = 'counting-provider-anonymous';
  public calls = 0;
  async runTask(task: AgentTask, _ctx: AgentContext): Promise<AgentResult> {
    this.calls++;
    return {
      task_id: task.id,
      agent: 'executor',
      status: 'skipped',
      summary: 'anonymous provider — no-op',
      changed_files: [],
      commands_run: [],
      verification_evidence: [],
      unable_to_verify_reason: 'noop',
      failures: [],
      risks: [],
      next_steps: [],
    };
  }
}

describe('Provider isolation', () => {
  it('SupervisorAgent drives an arbitrary AgentProvider implementation', async () => {
    const demo = await tmpDemo();
    const sup = new SupervisorAgent();
    const provider = new CountingProvider();
    const summaries = await sup.iterate({
      projectPath: demo,
      goal: 'noop',
      provider,
      maxIterations: 1,
    });
    expect(summaries.length).toBe(1);
    expect(provider.calls).toBeGreaterThan(0);
  });

  it('SupervisorAgent.ts never imports a concrete provider', async () => {
    const text = await fs.readFile(
      path.join(repoRoot, 'src', 'agents', 'SupervisorAgent.ts'),
      'utf8',
    );
    expect(text).not.toMatch(/MockAgentProvider/);
    expect(text).not.toMatch(/LocalCommandProvider/);
    expect(text).not.toMatch(/ClaudeCodeProvider/);
    expect(text).not.toMatch(/RuleBasedExecutor/);
    expect(text).not.toMatch(/FutureProvider/);
    expect(text).toMatch(/AgentProvider/); // only the interface
  });
});
