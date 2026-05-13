import { runCommand as rawRun } from '../../core/commandRunner.js';
import type { RunResult } from '../../core/commandRunner.js';
import { check as guardCheck } from './CommandGuard.js';
import { append as auditAppend } from '../../governance/audit/AuditLog.js';

export interface GuardedRunOptions {
  systemRoot: string;
  cwd: string;
  timeoutMs?: number;
  actor: string;
}

export interface GuardedRunResult extends RunResult {
  blocked?: boolean;
  reason?: string;
}

export async function run(command: string, opts: GuardedRunOptions): Promise<GuardedRunResult> {
  const g = guardCheck(command);
  if (!g.allowed) {
    await auditAppend(opts.systemRoot, {
      actor: opts.actor,
      action: 'command:blocked',
      target: command.slice(0, 200),
      decision: 'deny',
      risk_level: 'critical',
      metadata: { reason: g.reason, matched_rule: g.matched_rule },
    });
    return {
      command,
      exit_code: -1,
      stdout_summary: '',
      stderr_summary: `[command blocked by guard: ${g.reason}]`,
      passed: false,
      duration_ms: 0,
      failure_reason: `guard_blocked:${g.reason}`,
      blocked: true,
      reason: g.reason,
    };
  }
  await auditAppend(opts.systemRoot, {
    actor: opts.actor,
    action: 'command:run',
    target: command.slice(0, 200),
    decision: 'allow',
    risk_level: 'low',
  });
  return rawRun(command, { cwd: opts.cwd, timeoutMs: opts.timeoutMs });
}
