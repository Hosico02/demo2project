import type { AgentTask, AgentResult } from '../../core/types.js';
import type { AgentProvider, AgentContext } from './AgentProvider.js';

/**
 * Placeholder providers for executors we want to integrate later. They all
 * implement the `AgentProvider` contract so Supervisor never special-cases
 * any model. None of them call an external service in v0.0.2.
 *
 * To "wire" one of these, replace the body of `runTask` with a real
 * subprocess invocation (or SDK call) and parse the response into
 * `AgentResult`. The Verifier will independently re-run the task's
 * verification_commands so the model never gets to "trust me" past the gate.
 */
export class FutureProvider implements AgentProvider {
  constructor(readonly name: string, private reason = 'provider not implemented yet') {}

  async runTask(task: AgentTask, _ctx: AgentContext): Promise<AgentResult> {
    return {
      task_id: task.id,
      agent: 'executor',
      status: 'skipped',
      summary: `${this.name}: ${this.reason}`,
      changed_files: [],
      commands_run: [],
      verification_evidence: [],
      unable_to_verify_reason: 'provider_not_implemented',
      failures: [],
      risks: [`${this.name} is a placeholder — production runs must bind a real provider`],
      next_steps: [
        `Implement the ${this.name} subprocess / SDK invocation`,
        'Define the request/response JSON protocol (see docs/architecture.md)',
        'Validate response shape before constructing AgentResult',
      ],
    };
  }
}

export const CodexProvider = () => new FutureProvider('codex', 'OpenAI Codex provider not yet implemented');
export const DevinProvider = () => new FutureProvider('devin', 'Devin (Cognition) provider not yet implemented');
export const OpenHandsProvider = () => new FutureProvider('openhands', 'OpenHands (All-Hands) provider not yet implemented');
export const AiderProvider = () => new FutureProvider('aider', 'Aider provider not yet implemented');
