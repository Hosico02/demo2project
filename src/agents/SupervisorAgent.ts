import type {
  IterationSummary,
  IterationEvent,
  AgentResult,
  ProjectStandard,
  AgentTask,
} from '../core/types.js';
import { AnalyzerAgent } from './AnalyzerAgent.js';
import { PlannerAgent } from './PlannerAgent.js';
import { ExecutorAgent } from './ExecutorAgent.js';
import { VerifierAgent } from './VerifierAgent.js';
import { ReviewerAgent } from './ReviewerAgent.js';
import { MemoryAgent } from './MemoryAgent.js';
import { EventStore } from '../core/eventStore.js';
import { IterationWorkspace } from '../core/iterationWorkspace.js';
import { QAAgent } from '../qa/QAAgent.js';
import { QACaseStore } from '../qa/QACaseStore.js';
import { DEFAULT_PROJECT_STANDARD } from '../standards/defaultProjectStandard.js';
import { nowIso, shortId } from '../utils/time.js';
import type { AgentProvider } from './providers/AgentProvider.js';

export interface RetryPolicy {
  /** Max attempts INCLUDING the first try. 1 = no retry. */
  maxAttempts: number;
  /** Statuses that should trigger a retry. */
  retryOnStatuses: ('failed' | 'timeout')[];
}

export interface IterateOptions {
  projectPath: string;
  goal: string;
  provider: AgentProvider;
  standard?: ProjectStandard;
  maxIterations?: number;
  /** Inject the project's canonical verification commands. */
  extraVerificationCommands?: string[];
  systemRoot?: string; // for regression spec path
  /** Per-task retry policy. Default: no retry. */
  retryPolicy?: RetryPolicy;
  /** Parallel tasks per round. Default: 1 (sequential). */
  parallelism?: number;
  /** When true and project_path is a git repo, isolate each iteration on a branch. */
  useWorktree?: boolean;
}

/**
 * SupervisorAgent — orchestrates the closed loop.
 *
 * Loop body (per iteration):
 *   1. Analyzer: snapshot → score → gap
 *   2. QAAgent.preflight against known cases
 *   3. Planner: gap → plan
 *   4. For each task: Executor → Verifier → Reviewer → record events
 *   5. QAAgent.learn from events, update regression spec
 *   6. Re-score, decide whether to continue
 *
 * Stop conditions:
 *   - reached grade "production_ready_baseline"
 *   - maxIterations exhausted
 *   - score did not improve for 2 rounds in a row
 *   - safety / unrecoverable failure encountered
 */
export class SupervisorAgent {
  private analyzer: AnalyzerAgent;
  private planner = new PlannerAgent();
  private verifier = new VerifierAgent();
  private reviewer: ReviewerAgent;
  private memory = new MemoryAgent();
  private standard: ProjectStandard;

  constructor(opts: { standard?: ProjectStandard } = {}) {
    this.standard = opts.standard ?? DEFAULT_PROJECT_STANDARD;
    this.analyzer = new AnalyzerAgent(this.standard);
    this.reviewer = new ReviewerAgent(this.standard);
  }

  async iterate(opts: IterateOptions): Promise<IterationSummary[]> {
    const summaries: IterationSummary[] = [];
    const maxIter = opts.maxIterations ?? 1;
    const store = new EventStore(opts.projectPath);
    const caseStore = new QACaseStore(opts.projectPath);
    const qaAgent = new QAAgent(caseStore, this.memory);

    const executor = new ExecutorAgent(opts.provider, this.standard);

    let prevScore = -1;
    let noProgressRounds = 0;

    const workspace = opts.useWorktree ? new IterationWorkspace(opts.projectPath) : null;

    for (let i = 0; i < maxIter; i++) {
      const iterationId = shortId('iter');
      const startedAt = nowIso();
      await store.append({
        iteration_id: iterationId,
        agent: 'supervisor',
        event_type: 'iteration_started',
        severity: 'info',
        message: `iteration ${i + 1}/${maxIter} for goal "${opts.goal}"`,
      });

      let workspaceEnabled = false;
      if (workspace) {
        const begin = await workspace.begin(iterationId);
        workspaceEnabled = begin.enabled;
        await store.append({
          iteration_id: iterationId,
          agent: 'supervisor',
          event_type: 'note',
          severity: 'info',
          message: begin.enabled
            ? `workspace branch created: ${begin.manifest?.iter_branch}`
            : `workspace disabled: ${begin.reason ?? 'unknown'}`,
          metadata: { workspace_enabled: begin.enabled, reason: begin.reason },
        });
      }

      // 1. analyze
      const { snapshot, score: scoreBefore, gap } = await this.analyzer.fullAnalyze(opts.projectPath);

      // 2. preflight QA cases (consults global+workspace+repo scopes when systemRoot is provided)
      await qaAgent.preflight(iterationId, snapshot, store, { systemRoot: opts.systemRoot });

      // 3. plan
      const plan = this.planner.plan(gap, opts.goal, iterationId);

      // 4. execute each task (with optional retry + parallelism)
      const allResults: AgentResult[] = [];
      const reviewerFindings: string[] = [];
      const assignedTasks: AgentTask[] = [];
      const retryPolicy: RetryPolicy = opts.retryPolicy ?? { maxAttempts: 1, retryOnStatuses: ['failed'] };
      const parallelism = Math.max(1, opts.parallelism ?? 1);

      const runOne = async (task: AgentTask): Promise<AgentResult> => {
        assignedTasks.push(task);
        await store.append({
          iteration_id: iterationId,
          agent: 'supervisor',
          event_type: 'task_assigned',
          severity: 'info',
          message: `assigned: ${task.title}`,
          metadata: { task_id: task.id, assigned_to: task.assigned_to },
        });

        let lastVerified: AgentResult | null = null;
        for (let attempt = 1; attempt <= retryPolicy.maxAttempts; attempt++) {
          const execResult = await executor.execute(task, {
            project_path: opts.projectPath,
            iteration_id: iterationId,
            recent_events: await store.readIteration(iterationId),
          });
          lastVerified = await this.verifier.verify(
            opts.projectPath,
            execResult,
            opts.extraVerificationCommands ?? [],
          );

          const shouldRetry =
            attempt < retryPolicy.maxAttempts &&
            retryPolicy.retryOnStatuses.includes(lastVerified.status as 'failed') &&
            lastVerified.status === 'failed';
          if (!shouldRetry) break;
          await store.append({
            iteration_id: iterationId,
            agent: 'supervisor',
            event_type: 'note',
            severity: 'medium',
            message: `retrying task "${task.title}" (attempt ${attempt + 1}/${retryPolicy.maxAttempts})`,
            metadata: { task_id: task.id, attempt },
          });
        }
        const verified = lastVerified!;

        // Reviewer
        const findings = this.reviewer.review(task, verified);
        for (const f of findings) {
          reviewerFindings.push(`[${f.rule}/${f.severity}] ${f.message}`);
          await store.append({
            iteration_id: iterationId,
            agent: 'reviewer',
            event_type: 'review_finding',
            severity: f.severity,
            message: f.message,
            metadata: { rule: f.rule, task_id: task.id },
          });
        }

        // record final task event
        await store.append({
          iteration_id: iterationId,
          agent: 'executor',
          event_type: verified.status === 'completed' ? 'task_completed' : 'task_failed',
          severity: verified.status === 'completed' ? 'info' : 'high',
          message: verified.summary,
          files_changed: verified.changed_files,
          metadata: { task_id: task.id, commands_run: verified.commands_run },
        });
        for (const ev of verified.verification_evidence) {
          await store.append({
            iteration_id: iterationId,
            agent: 'verifier',
            event_type: ev.passed ? 'verification_passed' : 'verification_failed',
            severity: ev.passed ? 'info' : 'high',
            message: ev.passed ? `passed: ${ev.command}` : `failed: ${ev.command} (${ev.failure_reason ?? 'unknown'})`,
            command: ev.command,
            command_exit_code: ev.exit_code,
            raw_output: `${ev.stdout_summary}\n${ev.stderr_summary}`.slice(0, 4000),
            metadata: { duration_ms: ev.duration_ms },
          });
        }
        return verified;
      };

      // Run in chunks of `parallelism`
      for (let i2 = 0; i2 < plan.tasks.length; i2 += parallelism) {
        const slice = plan.tasks.slice(i2, i2 + parallelism);
        const results = await Promise.all(slice.map(runOne));
        for (const r of results) allResults.push(r);
      }

      // 5. QA learn from this iteration
      const events = await store.readIteration(iterationId);
      this.memory.ingest(events);
      const qaCases = await qaAgent.learnFromEvents(iterationId, events, store);

      // optional: update regression spec at system level
      if (opts.systemRoot) {
        await qaAgent.upsertRegressionSpec(opts.systemRoot);
      }

      // 6. re-score
      const { score: scoreAfter } = await this.analyzer.fullAnalyze(opts.projectPath);

      // 7. build & save summary
      const finishedAt = nowIso();
      const summary: IterationSummary = {
        iteration_id: iterationId,
        user_goal: opts.goal,
        project_path: opts.projectPath,
        project_snapshot: snapshot,
        gap_report: gap,
        iteration_plan: plan,
        assigned_tasks: assignedTasks,
        executor_results: allResults,
        changed_files: dedupe(allResults.flatMap((r) => r.changed_files)),
        verification_results: allResults.flatMap((r) => r.verification_evidence),
        reviewer_findings: reviewerFindings,
        qa_cases_created_or_updated: qaCases.map((c) => c.id),
        project_score_before: scoreBefore,
        project_score_after: scoreAfter,
        next_iteration_recommendations: gap.recommendations,
        started_at: startedAt,
        finished_at: finishedAt,
      };
      await store.saveIterationSummary(summary);
      await store.append({
        iteration_id: iterationId,
        agent: 'supervisor',
        event_type: 'iteration_finished',
        severity: 'info',
        message: `score ${scoreBefore.total} → ${scoreAfter.total}`,
      });
      summaries.push(summary);

      // Finalize workspace: success = score did not regress AND no high-sev review findings
      if (workspace && workspaceEnabled) {
        const success =
          scoreAfter.total >= scoreBefore.total &&
          !reviewerFindings.some((f) => /\/high\]|\/blocker\]/.test(f));
        const m = await workspace.finalize({ iterationId, success });
        await store.append({
          iteration_id: iterationId,
          agent: 'supervisor',
          event_type: 'note',
          severity: 'info',
          message: `workspace finalized: outcome=${m?.outcome ?? 'unknown'}`,
          metadata: { outcome: m?.outcome },
        });
      }

      // 8. stop conditions
      if (scoreAfter.grade === 'production_ready_baseline') break;
      if (prevScore >= 0 && scoreAfter.total <= prevScore) {
        noProgressRounds++;
        if (noProgressRounds >= 2) break;
      } else {
        noProgressRounds = 0;
      }
      prevScore = scoreAfter.total;
    }
    return summaries;
  }
}

function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
