import type { AgentProvider } from '../agents/providers/AgentProvider.js';
import type { AgentTask, AgentResult, ProjectStandard } from '../core/types.js';
import { AnalyzerAgent } from '../agents/AnalyzerAgent.js';
import { PlannerAgent } from '../agents/PlannerAgent.js';
import { nowIso, shortId } from '../utils/time.js';

/**
 * BaselineRunner — the *no-discipline* path.
 *
 * Calls the planner to enumerate tasks, then hands each task to the provider
 * exactly once. NO verification gate, NO reviewer, NO QA learning, NO
 * regression. This is what a session of "claude do stuff" looks like without
 * Demo2Project around it.
 *
 * Used as A in A/B; Demo2Project's SupervisorAgent is B.
 */
export interface BaselineResult {
  iteration_id: string;
  changed_files: string[];
  unverified_changes: number;
  results: AgentResult[];
  started_at: string;
  finished_at: string;
}

export async function runBaseline(opts: {
  projectPath: string;
  goal: string;
  provider: AgentProvider;
  maxTasks?: number;
  standard?: ProjectStandard;
}): Promise<BaselineResult> {
  const iterationId = shortId('baseline');
  const startedAt = nowIso();
  const analyzer = new AnalyzerAgent(opts.standard);
  const planner = new PlannerAgent();
  const { gap } = await analyzer.fullAnalyze(opts.projectPath);
  const plan = planner.plan(gap, opts.goal, iterationId);
  const tasks: AgentTask[] = plan.tasks.slice(0, opts.maxTasks ?? plan.tasks.length);

  const results: AgentResult[] = [];
  for (const task of tasks) {
    const r = await opts.provider.runTask(task, {
      project_path: opts.projectPath,
      iteration_id: iterationId,
      recent_events: [],
    });
    results.push(r);
  }
  const changedFiles = Array.from(new Set(results.flatMap((r) => r.changed_files)));
  const unverifiedChanges = results.filter(
    (r) => r.changed_files.length > 0 && r.verification_evidence.length === 0 && !r.unable_to_verify_reason,
  ).length;
  return {
    iteration_id: iterationId,
    changed_files: changedFiles,
    unverified_changes: unverifiedChanges,
    results,
    started_at: startedAt,
    finished_at: nowIso(),
  };
}
