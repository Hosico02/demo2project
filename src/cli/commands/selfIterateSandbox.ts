import path from 'node:path';
import { AnalyzerAgent } from '../../agents/AnalyzerAgent.js';
import { IterationWorkspace } from '../../core/iterationWorkspace.js';
import { recordPendingApprovals, loadPolicy } from '../../core/approvalGate.js';
import { runCommand } from '../../core/commandRunner.js';
import { flagNumber } from './_shared.js';

/**
 * self-iterate sandbox (Phase 4) — read-only by default; if --apply is set,
 * runs inside a worktree-bounded branch and AUTOMATICALLY ROLLS BACK on:
 *   - test failure
 *   - build failure
 *   - score regression
 *   - any high-risk path touched without approval
 *
 * Use it sparingly; this is the foundation for trustworthy self-mutation.
 */
export async function selfIterateSandbox(flags: Record<string, string | boolean>): Promise<number> {
  const apply = flags.apply === true || flags.apply === 'true';
  const _maxIter = flagNumber(flags, 'max-iterations', 1);
  const systemRoot = path.resolve(new URL('../../..', import.meta.url).pathname);

  // Phase-1 step: always re-score the system itself.
  const analyzer = new AnalyzerAgent();
  const { score: scoreBefore, gap } = await analyzer.fullAnalyze(systemRoot);

  // In read-only mode (default), STOP HERE. Print the plan we would apply.
  if (!apply) {
    process.stdout.write(JSON.stringify({
      mode: 'read-only',
      systemRoot,
      score_before: scoreBefore.total,
      grade_before: scoreBefore.grade,
      planned_findings: gap.findings.length,
      blockers: gap.blockers.length,
      next_steps: gap.recommendations,
      note: 'Pass --apply to attempt mutation inside an iteration worktree. High-risk paths still require approval.',
    }, null, 2) + '\n');
    return 0;
  }

  // --apply path: worktree + sanity gates
  const ws = new IterationWorkspace(systemRoot);
  const policy = await loadPolicy(systemRoot);
  const begin = await ws.begin('selfsandbox');
  if (!begin.enabled) {
    process.stderr.write(`error: workspace disabled: ${begin.reason ?? 'unknown'}\n`);
    return 1;
  }

  // Honor the approval gate immediately — DO NOT auto-modify high-risk paths.
  // For v0.0.4, this sandbox does not yet mutate; it proves the pipeline.
  const placeholderChanges = ['(self-iteration not yet generating writes)'];
  const pendings = await recordPendingApprovals(systemRoot, placeholderChanges, 'selfsandbox', policy);
  if (pendings.some((p) => p.risk === 'high')) {
    await ws.finalize({ iterationId: 'selfsandbox', success: false });
    process.stdout.write(JSON.stringify({ outcome: 'aborted', reason: 'high_risk_pending', pendings }, null, 2) + '\n');
    return 1;
  }

  // Run mandatory verification commands BEFORE finalizing.
  const tests = await runCommand('pnpm test', { cwd: systemRoot, timeoutMs: 180_000 });
  const build = await runCommand('pnpm build', { cwd: systemRoot, timeoutMs: 180_000 });
  const { score: scoreAfter } = await analyzer.fullAnalyze(systemRoot);
  const ok = tests.passed && build.passed && scoreAfter.total >= scoreBefore.total;
  const finalized = await ws.finalize({ iterationId: 'selfsandbox', success: ok });
  process.stdout.write(JSON.stringify({
    outcome: finalized?.outcome,
    tests_passed: tests.passed,
    build_passed: build.passed,
    score_before: scoreBefore.total,
    score_after: scoreAfter.total,
    pending_approvals: pendings,
  }, null, 2) + '\n');
  return ok ? 0 : 1;
}
