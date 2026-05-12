import type { AgentTask, AgentResult } from '../../core/types.js';
import type { AgentProvider, AgentContext } from './AgentProvider.js';

/**
 * MockAgentProvider — deterministic, no side effects, no LLM.
 *
 * Behaviour is configurable so tests can simulate:
 *  - a well-behaved executor (changes files AND runs verification)
 *  - a misbehaving executor (changes files but skips verification → trips QA)
 *  - an executor that explicitly cannot verify
 *  - a failure path (declared changes, but no verification, no reason)
 */
export type MockMode =
  | 'happy'
  | 'change_without_verify'
  | 'change_with_unable_reason'
  | 'noop';

export class MockAgentProvider implements AgentProvider {
  readonly name = 'mock';
  constructor(private mode: MockMode = 'happy') {}

  async runTask(task: AgentTask, _ctx: AgentContext): Promise<AgentResult> {
    const base: AgentResult = {
      task_id: task.id,
      agent: 'executor',
      status: 'completed',
      summary: `[mock:${this.mode}] applied task "${task.title}"`,
      changed_files: [],
      commands_run: [],
      verification_evidence: [],
      failures: [],
      risks: [],
      next_steps: [],
    };

    switch (this.mode) {
      case 'happy': {
        const file = task.expected_changed_files[0] ?? 'TOUCHED.md';
        base.changed_files = [file];
        base.commands_run = task.verification_commands.slice(0, 1);
        base.verification_evidence = task.verification_commands.slice(0, 1).map((c) => ({
          command: c,
          exit_code: 0,
          stdout_summary: '[mock] simulated success',
          stderr_summary: '',
          passed: true,
          duration_ms: 1,
        }));
        return base;
      }
      case 'change_without_verify': {
        const file = task.expected_changed_files[0] ?? 'TOUCHED.md';
        base.changed_files = [file];
        // Deliberately: no commands_run, no unable_to_verify_reason → QA target.
        return base;
      }
      case 'change_with_unable_reason': {
        const file = task.expected_changed_files[0] ?? 'TOUCHED.md';
        base.changed_files = [file];
        base.unable_to_verify_reason =
          'sandbox cannot run package manager in this environment';
        return base;
      }
      case 'noop':
      default:
        base.summary += ' (no changes made)';
        return base;
    }
  }
}
