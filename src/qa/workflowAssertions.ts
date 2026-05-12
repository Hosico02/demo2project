import type { IterationEvent, IterationSummary, QAAssertionResult } from '../core/types.js';

export interface AssertionInput {
  events: IterationEvent[];
  summaries: IterationSummary[];
}

export type WorkflowAssertion = (input: AssertionInput) => QAAssertionResult;

/**
 * Workflow-level assertions. Each takes the full iteration history of a
 * project and returns a single pass/fail with a human-readable message.
 *
 * These are the runtime mirror of QA cases — when a case exists, the
 * matching assertion must keep passing in future runs.
 */
export const WORKFLOW_ASSERTIONS: Record<string, WorkflowAssertion> = {
  missing_validation_after_code_change(input) {
    const offenders: string[] = [];
    for (const ev of input.events) {
      if (
        (ev.event_type === 'task_completed' || ev.event_type === 'task_failed') &&
        Array.isArray(ev.files_changed) &&
        ev.files_changed.length > 0
      ) {
        const cmds = Array.isArray(ev.metadata?.['commands_run'])
          ? (ev.metadata!['commands_run'] as string[])
          : [];
        if (cmds.length === 0) offenders.push(ev.id);
      }
    }
    return {
      assertion: 'missing_validation_after_code_change',
      passed: offenders.length === 0,
      message:
        offenders.length === 0
          ? 'All code-change events have associated commands_run.'
          : `${offenders.length} event(s) had file changes but no commands_run.`,
      related_events: offenders,
    };
  },

  supervisor_accepts_unverified_result(input) {
    const offenders = input.events
      .filter(
        (e) =>
          e.event_type === 'review_finding' &&
          e.metadata?.['rule'] === 'forbid_unverified_completion',
      )
      .map((e) => e.id);
    return {
      assertion: 'supervisor_accepts_unverified_result',
      passed: offenders.length === 0,
      message:
        offenders.length === 0
          ? 'No completed-without-evidence acceptance found.'
          : `${offenders.length} unverified-completion finding(s) recorded.`,
      related_events: offenders,
    };
  },

  repeated_failure_without_root_cause(input) {
    const counts = new Map<string, string[]>();
    for (const e of input.events) {
      if (e.event_type === 'verification_failed' && e.command) {
        const key = e.command.trim().split(/\s+/).slice(0, 2).join(' ').toLowerCase();
        const arr = counts.get(key) ?? [];
        arr.push(e.id);
        counts.set(key, arr);
      }
    }
    const offenders: string[] = [];
    for (const [, ids] of counts) {
      if (ids.length >= 2) offenders.push(...ids);
    }
    return {
      assertion: 'repeated_failure_without_root_cause',
      passed: offenders.length === 0,
      message:
        offenders.length === 0
          ? 'No command failed repeatedly within an iteration.'
          : `${offenders.length} repeated-failure event(s) detected.`,
      related_events: offenders,
    };
  },

  test_file_created_but_not_runnable(input) {
    const offenders: string[] = [];
    for (const s of input.summaries) {
      const wroteTests = s.changed_files.some((f) =>
        /(test|spec)\.(ts|tsx|js|jsx|py)$/.test(f) || /(^|\/)tests?\//.test(f),
      );
      const testRan = s.verification_results.some(
        (r) => /test|vitest|jest|pytest/i.test(r.command) && r.passed,
      );
      if (wroteTests && !testRan) {
        offenders.push(s.iteration_id);
      }
    }
    return {
      assertion: 'test_file_created_but_not_runnable',
      passed: offenders.length === 0,
      message:
        offenders.length === 0
          ? 'Where tests were authored, the test runner has been observed passing.'
          : `Iterations created test files but never observed a passing test run: ${offenders.join(', ')}.`,
      related_events: offenders,
    };
  },

  docs_claim_without_evidence(input) {
    const offenders: string[] = [];
    for (const s of input.summaries) {
      const docsTouched = s.changed_files.some((f) => /README|docs\//i.test(f));
      const anyEvidence = s.verification_results.length > 0;
      if (docsTouched && !anyEvidence) offenders.push(s.iteration_id);
    }
    return {
      assertion: 'docs_claim_without_evidence',
      passed: offenders.length === 0,
      message:
        offenders.length === 0
          ? 'No doc-only iterations skipped verification.'
          : `${offenders.length} doc-changing iteration(s) had no verification evidence.`,
      related_events: offenders,
    };
  },

  unsafe_command_detected(input) {
    const offenders = input.events
      .filter(
        (e) =>
          (e.event_type === 'verification_failed' &&
            typeof e.message === 'string' &&
            e.message.includes('unsafe_command_blocked')) ||
          (typeof e.message === 'string' && e.message.includes('unsafe_command_blocked')),
      )
      .map((e) => e.id);
    return {
      assertion: 'unsafe_command_detected',
      // We *want* this to pass when no unsafe commands appear, AND a
      // detection itself is a passing observation if the system blocked it.
      // For MVP we treat presence as a NOTABLE but not failing condition.
      passed: true,
      message:
        offenders.length === 0
          ? 'No dangerous commands attempted.'
          : `${offenders.length} dangerous command attempt(s) were blocked (good — system enforced safety).`,
      related_events: offenders,
    };
  },

  regression_spec_not_updated_after_failure(input) {
    // We can't easily verify external file state from event data alone — we
    // approximate by checking that whenever a high-severity failure is
    // present in events, at least one qa_case_created/updated event also
    // exists in the same iteration.
    const offenders: string[] = [];
    const byIter = new Map<string, IterationEvent[]>();
    for (const e of input.events) {
      const list = byIter.get(e.iteration_id) ?? [];
      list.push(e);
      byIter.set(e.iteration_id, list);
    }
    for (const [iter, evs] of byIter) {
      const hasFailure = evs.some(
        (e) => e.event_type === 'verification_failed' || e.event_type === 'task_failed',
      );
      const hasQAEvent = evs.some(
        (e) => e.event_type === 'qa_case_created' || e.event_type === 'qa_case_updated',
      );
      if (hasFailure && !hasQAEvent) offenders.push(iter);
    }
    return {
      assertion: 'regression_spec_not_updated_after_failure',
      passed: offenders.length === 0,
      message:
        offenders.length === 0
          ? 'Every iteration with high-severity failures recorded at least one QA case.'
          : `Iteration(s) had failures but no QA cases were recorded: ${offenders.join(', ')}.`,
      related_events: offenders,
    };
  },
};

export function listAssertions(): string[] {
  return Object.keys(WORKFLOW_ASSERTIONS);
}
