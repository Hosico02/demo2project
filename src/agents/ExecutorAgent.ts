import type { AgentTask, AgentResult, ProjectStandard } from '../core/types.js';
import type { AgentProvider, AgentContext } from './providers/AgentProvider.js';
import { DEFAULT_PROJECT_STANDARD } from '../standards/defaultProjectStandard.js';

/**
 * ExecutorAgent wraps an AgentProvider and enforces the project's
 * verification policy on whatever the provider returns.
 *
 * Critical invariant: if the provider reports changed_files but no
 * commands_run AND no unable_to_verify_reason, we do NOT mark the task
 * completed — we downgrade to "failed" with a structured failure. This is
 * the single most important rule the system enforces; QA Agent learns
 * from violations.
 */
export class ExecutorAgent {
  constructor(
    private provider: AgentProvider,
    private standard: ProjectStandard = DEFAULT_PROJECT_STANDARD,
  ) {}

  async execute(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
    const raw = await this.provider.runTask(task, ctx);
    return this.enforcePolicy(raw);
  }

  private enforcePolicy(result: AgentResult): AgentResult {
    const policy = this.standard.verification_policy;
    if (!policy.require_evidence_when_files_changed) return result;
    if (result.changed_files.length === 0) return result;

    const hasEvidence = result.verification_evidence.length > 0;
    const hasReason = !!result.unable_to_verify_reason;

    if (!hasEvidence && !hasReason) {
      return {
        ...result,
        status: 'failed',
        failures: [
          ...result.failures,
          'policy_violation:changed_files_without_verification_or_reason',
        ],
        risks: [
          ...result.risks,
          'Executor reported file changes but produced no verification evidence and no unable_to_verify_reason. Treated as failed per project standard.',
        ],
      };
    }
    return result;
  }
}
