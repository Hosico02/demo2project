import type { AgentResult, VerificationResult } from '../core/types.js';
import { runCommand } from '../core/commandRunner.js';

/**
 * VerifierAgent: independently re-runs the result's commands (or a fresh
 * set the supervisor passes in) and APPENDS evidence to the AgentResult.
 *
 * Why independent runs?
 *   - Providers may lie or misreport.
 *   - We want a deterministic, audit-friendly evidence trail.
 *
 * In MVP we trust evidence the provider produced AND optionally run extra
 * commands the supervisor injects (e.g. the project's canonical test cmd).
 */
export class VerifierAgent {
  async verify(
    projectPath: string,
    result: AgentResult,
    extraCommands: string[] = [],
    opts: { timeoutMs?: number } = {},
  ): Promise<AgentResult> {
    const extras: VerificationResult[] = [];
    for (const cmd of extraCommands) {
      const vr = await runCommand(cmd, {
        cwd: projectPath,
        timeoutMs: opts.timeoutMs ?? 60_000,
      });
      extras.push(vr);
    }
    const combinedEvidence = [...result.verification_evidence, ...extras];
    const passed = combinedEvidence.length > 0 && combinedEvidence.every((e) => e.passed);
    return {
      ...result,
      commands_run: [...result.commands_run, ...extraCommands],
      verification_evidence: combinedEvidence,
      status:
        result.status === 'skipped' ? 'skipped' :
        passed ? 'completed' :
        combinedEvidence.length === 0 && result.unable_to_verify_reason ? result.status :
        'failed',
    };
  }
}
