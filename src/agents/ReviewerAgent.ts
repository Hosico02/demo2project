import type { AgentResult, AgentTask, ProjectStandard } from '../core/types.js';
import { DEFAULT_PROJECT_STANDARD } from '../standards/defaultProjectStandard.js';

export interface ReviewFinding {
  severity: 'blocker' | 'high' | 'medium' | 'low' | 'info';
  message: string;
  rule: string;
}

/**
 * ReviewerAgent: rule-based, deterministic code/result review.
 *
 * MVP scope: check the AgentResult against the project standard and the
 * task's own acceptance_criteria. It does NOT diff source code — that
 * belongs to a future provider-backed reviewer.
 */
export class ReviewerAgent {
  constructor(private standard: ProjectStandard = DEFAULT_PROJECT_STANDARD) {}

  review(task: AgentTask, result: AgentResult): ReviewFinding[] {
    const findings: ReviewFinding[] = [];
    const policy = this.standard.verification_policy;

    if (
      policy.forbid_unverified_completion &&
      result.status === 'completed' &&
      result.changed_files.length > 0 &&
      result.verification_evidence.length === 0
    ) {
      findings.push({
        severity: 'high',
        message:
          'Result marked completed with file changes but no verification evidence.',
        rule: 'forbid_unverified_completion',
      });
    }

    if (result.changed_files.length > 0 && result.commands_run.length === 0 && !result.unable_to_verify_reason) {
      findings.push({
        severity: 'high',
        message:
          'Task changed files but executor ran no commands and gave no unable_to_verify_reason.',
        rule: 'missing_validation_after_code_change',
      });
    }

    if (result.failures.length > 0 && result.status === 'completed') {
      findings.push({
        severity: 'medium',
        message: `Result has failures but is marked completed: ${result.failures.join('; ')}`,
        rule: 'inconsistent_status',
      });
    }

    // acceptance criteria sanity (cannot really verify content, but flag empty)
    if (task.acceptance_criteria.length === 0) {
      findings.push({
        severity: 'low',
        message: 'Task had no acceptance criteria — cannot judge whether it is done.',
        rule: 'task_missing_acceptance_criteria',
      });
    }

    return findings;
  }
}
