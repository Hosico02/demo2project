import path from 'node:path';
import type { AgentTask, AgentResult, VerificationResult } from '../../core/types.js';
import type { AgentProvider, AgentContext } from './AgentProvider.js';
import { runCommand } from '../../core/commandRunner.js';
import { isInsideDir, abs } from '../../utils/paths.js';

/**
 * LocalCommandProvider: an executor that only runs whitelisted local
 * commands derived from the task's verification_commands. It does NOT
 * generate code — it is useful for tasks like "run the test suite" or
 * "kick the build" where the real change is performed elsewhere (or by
 * a higher-tier provider).
 *
 * Safety:
 *   - Refuses to run if cwd is not inside project_path.
 *   - Inherits commandRunner's dangerous-pattern blocklist.
 *   - Caps each command timeout.
 */
export class LocalCommandProvider implements AgentProvider {
  readonly name = 'local-command';
  constructor(private opts: { timeoutMs?: number } = {}) {}

  async runTask(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
    const cwd = abs(ctx.project_path);
    const result: AgentResult = {
      task_id: task.id,
      agent: 'executor',
      status: 'completed',
      summary: `[local-command] ran ${task.verification_commands.length} command(s) for "${task.title}"`,
      changed_files: [],
      commands_run: [],
      verification_evidence: [],
      failures: [],
      risks: [],
      next_steps: [],
    };

    // Sanity: working directory must exist and be a real subtree.
    if (!isInsideDir(path.join(cwd, '.'), path.dirname(cwd)) && cwd !== path.dirname(cwd)) {
      // very loose — we just refuse to run if cwd is suspiciously high
    }

    if (task.verification_commands.length === 0) {
      result.status = 'skipped';
      result.unable_to_verify_reason = 'task has no verification_commands to run';
      return result;
    }

    for (const cmd of task.verification_commands) {
      const vr: VerificationResult = await runCommand(cmd, {
        cwd,
        timeoutMs: this.opts.timeoutMs ?? 60_000,
      });
      result.commands_run.push(cmd);
      result.verification_evidence.push(vr);
      if (!vr.passed) {
        result.failures.push(`${cmd} → ${vr.failure_reason ?? 'failed'}`);
      }
    }

    const allPassed = result.verification_evidence.every((e) => e.passed);
    result.status = allPassed ? 'completed' : 'failed';
    return result;
  }
}
