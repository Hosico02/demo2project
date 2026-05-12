import type { AgentTask, AgentResult, IterationEvent } from '../../core/types.js';

export interface AgentContext {
  project_path: string;
  iteration_id: string;
  /**
   * Recently appended events from THIS iteration — provides short-term memory
   * for the executor without re-reading disk.
   */
  recent_events: IterationEvent[];
  /**
   * Optional knobs the supervisor can inject (e.g. dry_run, max_timeout).
   */
  options?: Record<string, unknown>;
}

/**
 * Pluggable agent backend. Implementations decide HOW a task is carried out
 * (mock, local-command, Claude Code, Claude API, OpenAI, etc).
 *
 * The contract is intentionally narrow: a provider receives an AgentTask and
 * must produce an AgentResult. The provider is responsible for capturing its
 * own commands_run / verification_evidence — the Verifier may still re-run
 * verification on top, but the provider should not lie about what it ran.
 */
export interface AgentProvider {
  readonly name: string;
  runTask(task: AgentTask, context: AgentContext): Promise<AgentResult>;
}
