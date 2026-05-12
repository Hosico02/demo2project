import type { IterationEvent, QACase, AgentName, Severity } from '../core/types.js';
import { nowIso, shortId } from '../utils/time.js';
import { redact } from '../core/redaction.js';

/**
 * Convert raw iteration events into QA Cases.
 *
 * Each generator detects ONE failure mode. Generators are pure functions
 * over the event list; QAAgent dedupes results via fingerprint.
 */
type Generator = (events: IterationEvent[], iterationId: string) => QACase[];

const GENERATORS: Generator[] = [
  detectMissingValidationAfterCodeChange,
  detectSupervisorAcceptsUnverified,
  detectRepeatedFailure,
  detectUnsafeCommand,
  detectReviewFindings,
];

export function generateCasesFromEvents(
  events: IterationEvent[],
  iterationId: string,
): QACase[] {
  const out: QACase[] = [];
  for (const gen of GENERATORS) {
    out.push(...gen(events, iterationId));
  }
  return out;
}

// -- Detectors ------------------------------------------------------------

function detectMissingValidationAfterCodeChange(
  events: IterationEvent[],
  iterationId: string,
): QACase[] {
  const cases: QACase[] = [];
  for (const ev of events) {
    if (
      (ev.event_type === 'task_completed' || ev.event_type === 'task_failed') &&
      Array.isArray(ev.files_changed) &&
      ev.files_changed.length > 0
    ) {
      const commandsRun = Array.isArray(ev.metadata?.['commands_run'])
        ? (ev.metadata!['commands_run'] as string[])
        : [];
      if (commandsRun.length === 0) {
        cases.push(
          baseCase({
            iteration_id: iterationId,
            agent: ev.agent,
            fingerprint: 'missing_validation_after_code_change',
            title: 'Executor changed files without running validation',
            category: 'missing_validation',
            severity: 'high',
            trigger:
              'Executor returned a non-empty changed_files but reported no commands_run and no unable_to_verify_reason.',
            expected:
              'Every code change must be followed by at least one verification command (test/lint/build/typecheck/smoke), or an explicit unable_to_verify_reason.',
            actual: redact(ev.message),
            related_files: ev.files_changed ?? [],
          }),
        );
      }
    }
  }
  return cases;
}

function detectSupervisorAcceptsUnverified(
  events: IterationEvent[],
  iterationId: string,
): QACase[] {
  // We rely on Reviewer findings emitted by SupervisorAgent.
  return events
    .filter(
      (e) =>
        e.event_type === 'review_finding' &&
        e.metadata?.['rule'] === 'forbid_unverified_completion',
    )
    .map((e) =>
      baseCase({
        iteration_id: iterationId,
        agent: e.agent,
        fingerprint: 'supervisor_accepts_unverified_result',
        title: 'Supervisor accepted a completed result without verification evidence',
        category: 'verification_gate',
        severity: 'high',
        trigger: 'A completed task had file changes but no verification_evidence entries.',
        expected: 'Supervisor must reject completed status without evidence (or require unable_to_verify_reason).',
        actual: redact(e.message),
        related_files: [],
      }),
    );
}

function detectRepeatedFailure(
  events: IterationEvent[],
  iterationId: string,
): QACase[] {
  const counts = new Map<string, number>();
  for (const e of events) {
    if (e.event_type === 'verification_failed' && e.command) {
      const key = e.command.trim().split(/\s+/).slice(0, 2).join(' ').toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const out: QACase[] = [];
  for (const [cmd, n] of counts) {
    if (n >= 2) {
      out.push(
        baseCase({
          iteration_id: iterationId,
          agent: 'verifier',
          fingerprint: `repeated_failure_without_root_cause:${cmd}`,
          title: `Command "${cmd}" failed ${n} times in one iteration without root-cause analysis`,
          category: 'repeated_failure',
          severity: 'high',
          trigger: 'The same command failed repeatedly within a single iteration with no documented root cause.',
          expected: 'After two consecutive failures of the same command, the executor must summarize root cause before continuing.',
          actual: `command "${cmd}" failed ${n} times`,
          related_files: [],
        }),
      );
    }
  }
  return out;
}

function detectUnsafeCommand(
  events: IterationEvent[],
  iterationId: string,
): QACase[] {
  return events
    .filter(
      (e) =>
        e.event_type === 'verification_failed' &&
        typeof e.message === 'string' &&
        e.message.includes('unsafe_command_blocked'),
    )
    .map((e) =>
      baseCase({
        iteration_id: iterationId,
        agent: e.agent,
        fingerprint: 'unsafe_command_detected',
        title: 'Dangerous command attempted',
        category: 'safety',
        severity: 'blocker',
        trigger: 'A command matching the dangerous-pattern blocklist was attempted.',
        expected: 'Dangerous commands must be blocked before execution and recorded as QA cases.',
        actual: redact(e.message),
        related_files: [],
      }),
    );
}

function detectReviewFindings(
  events: IterationEvent[],
  iterationId: string,
): QACase[] {
  return events
    .filter(
      (e) =>
        e.event_type === 'review_finding' &&
        e.metadata?.['rule'] === 'missing_validation_after_code_change',
    )
    .map((e) =>
      baseCase({
        iteration_id: iterationId,
        agent: 'reviewer',
        fingerprint: 'missing_validation_after_code_change',
        title: 'Reviewer flagged missing validation after code change',
        category: 'missing_validation',
        severity: 'high',
        trigger: 'Reviewer emitted missing_validation_after_code_change.',
        expected: 'Every code change must be followed by a verification step.',
        actual: redact(e.message),
        related_files: [],
      }),
    );
}

// -- Helpers --------------------------------------------------------------

function baseCase(input: {
  iteration_id: string;
  agent: AgentName;
  fingerprint: string;
  title: string;
  category: string;
  severity: Severity;
  trigger: string;
  expected: string;
  actual: string;
  related_files: string[];
}): QACase {
  const now = nowIso();
  return {
    id: shortId('qa'),
    title: input.title,
    category: input.category,
    severity: input.severity,
    frequency: 1,
    status: 'active',
    project_type: ['generic'],
    bug_source: {
      iteration_id: input.iteration_id,
      agent: input.agent,
      source: 'iteration_event',
      related_files: input.related_files,
    },
    trigger_condition: input.trigger,
    human_flow: [
      { step: 1, actor: 'user', action: 'requests a code-modifying change' },
      { step: 2, actor: 'supervisor', action: 'plans and assigns task' },
      { step: 3, actor: 'executor', action: 'applies the change' },
      { step: 4, actor: 'executor', action: 'must run at least one verification command' },
      { step: 5, actor: 'supervisor', action: 'checks evidence before marking task complete' },
    ],
    expected_behavior: input.expected,
    actual_failure: input.actual,
    regression_assertions: [
      'if changed_files is non-empty then commands_run must be non-empty',
      'if commands_run is empty then unable_to_verify_reason must be set',
      'supervisor must not accept completed without verification_evidence',
    ],
    reproduction_steps: [
      'configure executor to return changed_files without commands_run',
      'run a single iteration',
      'inspect QA regression runner output',
    ],
    suggested_test_type: 'workflow_regression',
    fingerprint: input.fingerprint,
    created_at: now,
    updated_at: now,
    last_seen_at: now,
    related_files: input.related_files,
  };
}
