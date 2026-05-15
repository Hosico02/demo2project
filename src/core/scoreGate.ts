import type { ScoreEvidenceEntry, ScoreGateFailure, ScoreGateResult } from './types.js';

export interface ScoreGateInput {
  evidence: ScoreEvidenceEntry[];
  unverifiedChangedFiles?: boolean;
  highSeverityOpenGaps?: number;
}

/**
 * Fail-closed project readiness gate.
 *
 * The numeric scorer can still describe progress, but hard verification
 * failures cap the final score so a project with red tests cannot look
 * product-ready because it has the right files.
 */
export function evaluateScoreGate(input: ScoreGateInput): ScoreGateResult {
  const failures: ScoreGateFailure[] = [];
  for (const ev of input.evidence) {
    if (ev.result !== 'failed') continue;
    if (ev.dimension === 'build_score') {
      if (!ev.evidence_command) continue;
      failures.push({
        gate: 'build',
        cap: 39,
        reason: 'build command failed',
        evidence_command: ev.evidence_command,
        stdout_summary: ev.stdout_summary,
        stderr_summary: ev.stderr_summary,
        failure_reason: ev.failure_reason,
      });
    }
    if (ev.dimension === 'test_score') {
      if (!ev.evidence_command) continue;
      failures.push({
        gate: 'test',
        cap: 49,
        reason: 'test command failed',
        evidence_command: ev.evidence_command,
        stdout_summary: ev.stdout_summary,
        stderr_summary: ev.stderr_summary,
        failure_reason: ev.failure_reason,
      });
    }
  }
  if (input.unverifiedChangedFiles) {
    failures.push({
      gate: 'verification',
      cap: 59,
      reason: 'latest iteration has changed files without verification evidence',
    });
  }
  if ((input.highSeverityOpenGaps ?? 0) > 0) {
    failures.push({
      gate: 'gap',
      cap: 79,
      reason: `${input.highSeverityOpenGaps} high-severity gap(s) remain open`,
    });
  }

  const cap = failures.length > 0 ? Math.min(...failures.map((f) => f.cap)) : 100;
  return {
    status: failures.length > 0 ? 'failed' : 'passed',
    cap,
    failures,
  };
}

export function applyScoreGate(total: number, gate: ScoreGateResult): number {
  return Math.min(total, gate.cap);
}
