import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { SupervisorAgent } from '../agents/SupervisorAgent.js';
import { AnalyzerAgent } from '../agents/AnalyzerAgent.js';
import type { AgentProvider } from '../agents/providers/AgentProvider.js';
import { runDocsTruth } from '../core/docsTruth.js';
import { QACaseStore } from '../qa/QACaseStore.js';
import { CostTracker } from '../core/costTracker.js';
import { writeJson } from '../utils/json.js';

export type LongRunStopReason =
  | 'target_reached'
  | 'iteration_limit_reached'
  | 'duration_limit_reached'
  | 'no_progress_limit_reached';

export interface LongRunPoint {
  iter: number;
  score: number;
  gap_count: number;
  blocker_count: number;
  docs_truth_missing: number;
  qa_case_count: number;
  verification_pass_rate: number;
}

export interface LongRunSummary {
  source_project: string;
  workspace_path: string;
  in_place: boolean;
  provider: string;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  stop_reason: LongRunStopReason;
  rounds_completed: number;
  target_score: number;
  final_score: number;
  final_gap_count: number;
  score_trend: number[];
  gap_count_trend: number[];
  verification_pass_rate_trend: number[];
  docs_truth_trend: number[];
  qa_memory_growth: number[];
  rollback_count: number;
  unresolved_risk_count: number;
  final_stability_rating: 'stable' | 'volatile' | 'degraded_after_peak';
  total_cost_estimate_usd: number;
  total_wall_time_ms: number;
  report_path?: string;
}

export interface LongRunProductizationOptions {
  projectPath: string;
  provider: AgentProvider;
  providerName?: string;
  systemRoot?: string;
  goal?: string;
  maxIterations?: number;
  durationMs?: number;
  heartbeatMs?: number;
  targetScore?: number;
  maxNoProgressRounds?: number;
  inPlace?: boolean;
  outputPath?: string;
  onHeartbeat?: (point: LongRunPoint) => void;
}

export async function runLongRunProductization(
  opts: LongRunProductizationOptions,
): Promise<LongRunSummary> {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const maxIterations = opts.maxIterations ?? 10;
  const targetScore = opts.targetScore ?? 86;
  const maxNoProgressRounds = opts.maxNoProgressRounds ?? 3;
  const heartbeatMs = opts.heartbeatMs ?? 300_000;
  const inPlace = opts.inPlace ?? false;
  const workspace = inPlace
    ? opts.projectPath
    : path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'd2p-long-')), path.basename(opts.projectPath));
  if (!inPlace) await copyDir(opts.projectPath, workspace);

  const sup = new SupervisorAgent();
  const analyzer = new AnalyzerAgent();
  const trend: LongRunPoint[] = [];
  let bestScore = -1;
  let bestGapCount = Number.POSITIVE_INFINITY;
  let noProgressRounds = 0;
  let roundsCompleted = 0;
  let stopReason: LongRunStopReason = 'iteration_limit_reached';
  let lastHeartbeat = startedMs;

  const initial = await collectPoint(0, workspace, analyzer, []);
  trend.push(initial);
  bestScore = initial.score;
  bestGapCount = initial.gap_count;
  maybeHeartbeat(initial);

  while (true) {
    if (targetReached(trend[trend.length - 1]!, targetScore)) {
      stopReason = 'target_reached';
      break;
    }
    if (roundsCompleted >= maxIterations) {
      stopReason = 'iteration_limit_reached';
      break;
    }
    if (opts.durationMs !== undefined && Date.now() - startedMs >= opts.durationMs) {
      stopReason = 'duration_limit_reached';
      break;
    }

    const summaries = await sup.iterate({
      projectPath: workspace,
      goal: `${opts.goal ?? 'demo-to-product long-run'}/round-${roundsCompleted + 1}`,
      provider: opts.provider,
      maxIterations: 1,
      systemRoot: opts.systemRoot,
    });
    roundsCompleted++;

    const point = await collectPoint(roundsCompleted, workspace, analyzer, summaries.flatMap((s) => s.verification_results));
    trend.push(point);
    maybeHeartbeat(point);

    const madeProgress = point.score > bestScore || point.gap_count < bestGapCount;
    if (madeProgress) {
      bestScore = Math.max(bestScore, point.score);
      bestGapCount = Math.min(bestGapCount, point.gap_count);
      noProgressRounds = 0;
    } else {
      noProgressRounds++;
      if (noProgressRounds >= maxNoProgressRounds) {
        stopReason = 'no_progress_limit_reached';
        break;
      }
    }
  }

  const cost = (await CostTracker.readAll(workspace)).filter((record) => {
    const recordStarted = Date.parse(record.started_at);
    return Number.isFinite(recordStarted) && recordStarted >= startedMs;
  });
  const scoreTrend = trend.map((t) => t.score);
  const finalPoint = trend[trend.length - 1]!;
  const peakScore = Math.max(...scoreTrend);
  const stable = trend.slice(-5).every((t, idx, arr) => idx === 0 || Math.abs(t.score - arr[idx - 1]!.score) <= 5);
  const summary: LongRunSummary = {
    source_project: opts.projectPath,
    workspace_path: workspace,
    in_place: inPlace,
    provider: opts.providerName ?? opts.provider.name,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    duration_ms: Date.now() - startedMs,
    stop_reason: stopReason,
    rounds_completed: roundsCompleted,
    target_score: targetScore,
    final_score: finalPoint.score,
    final_gap_count: finalPoint.gap_count,
    score_trend: scoreTrend,
    gap_count_trend: trend.map((t) => t.gap_count),
    verification_pass_rate_trend: trend.map((t) => t.verification_pass_rate),
    docs_truth_trend: trend.map((t) => t.docs_truth_missing),
    qa_memory_growth: trend.map((t) => t.qa_case_count),
    rollback_count: cost.reduce((a, c) => a + c.rollback_count, 0),
    unresolved_risk_count: finalPoint.docs_truth_missing + finalPoint.gap_count,
    final_stability_rating:
      finalPoint.score < peakScore - 5 ? 'degraded_after_peak' :
      stable ? 'stable' : 'volatile',
    total_cost_estimate_usd: cost.reduce((a, c) => a + c.cost_estimate_usd, 0),
    total_wall_time_ms: cost.reduce((a, c) => a + c.wall_time_ms, 0),
  };
  if (opts.outputPath) {
    summary.report_path = opts.outputPath;
    await writeJson(opts.outputPath, summary);
  }
  return summary;

  function maybeHeartbeat(point: LongRunPoint): void {
    if (!opts.onHeartbeat) return;
    const now = Date.now();
    if (point.iter === 0 || now - lastHeartbeat >= heartbeatMs) {
      opts.onHeartbeat(point);
      lastHeartbeat = now;
    }
  }
}

async function collectPoint(
  iter: number,
  projectPath: string,
  analyzer: AnalyzerAgent,
  verificationResults: Array<{ passed: boolean }>,
): Promise<LongRunPoint> {
  const { score, gap } = await analyzer.fullAnalyze(projectPath);
  const docs = await runDocsTruth(projectPath);
  const cases = await new QACaseStore(projectPath).loadCases();
  const passRate = verificationResults.length === 0
    ? 0
    : verificationResults.filter((v) => v.passed).length / verificationResults.length;
  return {
    iter,
    score: score.total,
    gap_count: gap.findings.length,
    blocker_count: gap.blockers.length,
    docs_truth_missing: docs.missing,
    qa_case_count: cases.length,
    verification_pass_rate: Number(passRate.toFixed(3)),
  };
}

function targetReached(point: LongRunPoint, targetScore: number): boolean {
  return point.score >= targetScore && point.gap_count === 0 && point.blocker_count === 0;
}

async function copyDir(src: string, dst: string): Promise<void> {
  await fs.mkdir(dst, { recursive: true });
  for (const e of await fs.readdir(src, { withFileTypes: true })) {
    if (['node_modules', '.git', '.venv', '__pycache__', '.pytest_cache'].includes(e.name)) continue;
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) await copyDir(s, d);
    else if (e.isFile()) await fs.copyFile(s, d);
  }
}
