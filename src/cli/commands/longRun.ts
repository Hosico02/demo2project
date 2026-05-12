import path from 'node:path';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import { SupervisorAgent } from '../../agents/SupervisorAgent.js';
import { AnalyzerAgent } from '../../agents/AnalyzerAgent.js';
import { MockAgentProvider } from '../../agents/providers/MockAgentProvider.js';
import { RuleBasedExecutor } from '../../agents/providers/RuleBasedExecutor.js';
import type { AgentProvider } from '../../agents/providers/AgentProvider.js';
import { runDocsTruth } from '../../core/docsTruth.js';
import { QACaseStore } from '../../qa/QACaseStore.js';
import { CostTracker } from '../../core/costTracker.js';
import { flagString, flagNumber, requireProject } from './_shared.js';

interface IterationDataPoint {
  iter: number;
  score: number;
  docs_truth_missing: number;
  qa_case_count: number;
  verification_pass_rate: number;
  regression_count: number;
}

function pickProvider(name: string): AgentProvider {
  switch (name) {
    case 'rule-based': return new RuleBasedExecutor();
    case 'mock':
    default: return new MockAgentProvider('happy');
  }
}

export async function longRun(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const iterations = flagNumber(flags, 'iterations', 10);
  const providerName = flagString(flags, 'provider', 'rule-based')!;
  const systemRoot = path.resolve(new URL('../../..', import.meta.url).pathname);

  // Work on a copy so the source is not mutated.
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'd2p-long-'));
  await copyDir(project, tmp);

  const sup = new SupervisorAgent();
  const analyzer = new AnalyzerAgent();
  const trend: IterationDataPoint[] = [];

  // Initial snapshot
  const { score: initial } = await analyzer.fullAnalyze(tmp);
  trend.push({
    iter: 0,
    score: initial.total,
    docs_truth_missing: (await runDocsTruth(tmp)).missing,
    qa_case_count: 0,
    verification_pass_rate: 0,
    regression_count: 0,
  });

  for (let i = 1; i <= iterations; i++) {
    const summaries = await sup.iterate({
      projectPath: tmp,
      goal: `long-run/${i}`,
      provider: pickProvider(providerName),
      maxIterations: 1,
      systemRoot,
    });
    const { score } = await analyzer.fullAnalyze(tmp);
    const docs = await runDocsTruth(tmp);
    const verifs = summaries.flatMap((s) => s.verification_results);
    const passRate = verifs.length === 0 ? 0 : verifs.filter((v) => v.passed).length / verifs.length;
    const cases = await new QACaseStore(tmp).loadCases();
    trend.push({
      iter: i,
      score: score.total,
      docs_truth_missing: docs.missing,
      qa_case_count: cases.length,
      verification_pass_rate: Number(passRate.toFixed(3)),
      regression_count: 0,
    });
  }

  const cost = await CostTracker.readAll(tmp);
  const trendScores = trend.map((t) => t.score);
  const finalScore = trendScores[trendScores.length - 1] ?? initial.total;
  const peakScore = Math.max(...trendScores);
  const degradedAfterPeak = finalScore < peakScore - 5;
  const stable = trend.slice(-5).every((t, idx, arr) => idx === 0 || Math.abs(t.score - arr[idx - 1]!.score) <= 5);

  const summary = {
    project: project,
    provider: providerName,
    iterations,
    score_trend: trendScores,
    verification_pass_rate_trend: trend.map((t) => t.verification_pass_rate),
    regression_count_trend: trend.map((t) => t.regression_count),
    docs_truth_trend: trend.map((t) => t.docs_truth_missing),
    qa_memory_growth: trend.map((t) => t.qa_case_count),
    rollback_count: cost.reduce((a, c) => a + c.rollback_count, 0),
    unresolved_risk_count: trend[trend.length - 1]!.docs_truth_missing,
    final_stability_rating:
      degradedAfterPeak ? 'degraded_after_peak' :
      stable ? 'stable' : 'volatile',
    total_cost_estimate_usd: cost.reduce((a, c) => a + c.cost_estimate_usd, 0),
    total_wall_time_ms: cost.reduce((a, c) => a + c.wall_time_ms, 0),
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  return 0;
}

async function copyDir(src: string, dst: string): Promise<void> {
  await fs.mkdir(dst, { recursive: true });
  for (const e of await fs.readdir(src, { withFileTypes: true })) {
    if (['node_modules', '.git', '.demo2project'].includes(e.name)) continue;
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) await copyDir(s, d);
    else if (e.isFile()) await fs.copyFile(s, d);
  }
}
