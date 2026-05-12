import path from 'node:path';
import { AnalyzerAgent } from '../../agents/AnalyzerAgent.js';
import { PlannerAgent } from '../../agents/PlannerAgent.js';

/**
 * self-iterate (read-only): produce the plan the system would apply to
 * itself, without mutating anything. The mutating variant lives in a
 * future phase per docs/self-iteration.md — at v0.0.1 we want the
 * planning artifact only.
 */
export async function selfIterate(_flags: Record<string, string | boolean>): Promise<number> {
  const root = path.resolve(new URL('../../..', import.meta.url).pathname);
  const analyzer = new AnalyzerAgent();
  const planner = new PlannerAgent();
  const { snapshot, score, gap } = await analyzer.fullAnalyze(root);
  const plan = planner.plan(gap, 'self-improve');
  const out = {
    self_path: root,
    score_before: score.total,
    grade_before: score.grade,
    blockers: gap.blockers.length,
    plan_summary: plan.tasks.map((t) => ({
      title: t.title,
      priority: t.priority,
      expected_changed_files: t.expected_changed_files,
      verification_commands: t.verification_commands,
    })),
    next_phase_note:
      'Phase-5 mutating self-iteration is intentionally deferred. See docs/self-iteration.md.',
    snapshot_summary: {
      language: snapshot.detected_language,
      package_manager: snapshot.package_manager,
      test_commands: snapshot.test_commands,
      build_commands: snapshot.build_commands,
    },
  };
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  return 0;
}
