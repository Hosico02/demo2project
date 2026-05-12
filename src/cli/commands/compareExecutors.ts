import path from 'node:path';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { SupervisorAgent } from '../../agents/SupervisorAgent.js';
import { AnalyzerAgent } from '../../agents/AnalyzerAgent.js';
import { MockAgentProvider } from '../../agents/providers/MockAgentProvider.js';
import { LocalCommandProvider } from '../../agents/providers/LocalCommandProvider.js';
import { RuleBasedExecutor } from '../../agents/providers/RuleBasedExecutor.js';
import { NaiveBaselineProvider } from '../../agents/providers/NaiveBaselineProvider.js';
import { ClaudeCliProvider } from '../../agents/providers/ClaudeCodeProvider.js';
import { CodexProvider, DevinProvider, OpenHandsProvider, AiderProvider } from '../../agents/providers/FutureProvider.js';
import type { AgentProvider } from '../../agents/providers/AgentProvider.js';
import { flagString, flagNumber } from './_shared.js';

interface Row {
  provider: string;
  success_rate: number;
  score_before: number;
  score_after: number;
  score_delta: number;
  verification_pass_rate: number;
  unverified_change_count: number;
  regression_count: number;
  duration_ms: number;
  qa_cases_triggered: number;
  rollback_count: number;
  confidence: 'high' | 'medium' | 'low';
}

function pick(name: string): AgentProvider | null {
  switch (name) {
    case 'mock': return new MockAgentProvider('happy');
    case 'local': return new LocalCommandProvider();
    case 'rule-based': return new RuleBasedExecutor();
    case 'naive-baseline': return new NaiveBaselineProvider();
    case 'claude-cli': return new ClaudeCliProvider({ enabled: true });
    case 'claude-cli-dry': return new ClaudeCliProvider({ enabled: false });
    case 'codex': return CodexProvider();
    case 'devin': return DevinProvider();
    case 'openhands': return OpenHandsProvider();
    case 'aider': return AiderProvider();
    default: return null;
  }
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

export async function compareExecutors(flags: Record<string, string | boolean>): Promise<number> {
  const caseName = flagString(flags, 'case', 'bad-node-cli')!;
  const providerList = (flagString(flags, 'providers', 'rule-based,naive-baseline,mock,claude-cli-dry') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const maxIter = flagNumber(flags, 'max-iterations', 1);
  const systemRoot = path.resolve(new URL('../../..', import.meta.url).pathname);
  const benchPath = path.join(systemRoot, 'benchmarks', 'public', caseName);
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'd2p-cmp-'));

  const analyzer = new AnalyzerAgent();
  const rows: Row[] = [];

  for (const name of providerList) {
    const provider = pick(name);
    if (!provider) {
      process.stderr.write(`skip unknown provider: ${name}\n`);
      continue;
    }
    const sandbox = path.join(tmpRoot, name);
    await copyDir(benchPath, sandbox);
    const t0 = performance.now();
    const { score: before } = await analyzer.fullAnalyze(sandbox);
    const sup = new SupervisorAgent();
    const summaries = await sup.iterate({
      projectPath: sandbox,
      goal: `compare:${name}`,
      provider,
      maxIterations: maxIter,
      systemRoot,
    });
    const { score: after } = await analyzer.fullAnalyze(sandbox);
    const duration = Math.round(performance.now() - t0);

    const allVerifs = summaries.flatMap((s) => s.verification_results);
    const allResults = summaries.flatMap((s) => s.executor_results);
    const unverified = allResults.filter(
      (r) => r.changed_files.length > 0 && r.verification_evidence.length === 0 && !r.unable_to_verify_reason,
    ).length;
    const passRate = allVerifs.length === 0 ? 0 : allVerifs.filter((v) => v.passed).length / allVerifs.length;
    const success = allResults.filter((r) => r.status === 'completed').length;
    const qaCases = summaries.reduce((a, s) => a + s.qa_cases_created_or_updated.length, 0);

    rows.push({
      provider: name,
      success_rate: allResults.length === 0 ? 0 : Number((success / allResults.length).toFixed(3)),
      score_before: before.total,
      score_after: after.total,
      score_delta: after.total - before.total,
      verification_pass_rate: Number(passRate.toFixed(3)),
      unverified_change_count: unverified,
      regression_count: 0,
      duration_ms: duration,
      qa_cases_triggered: qaCases,
      rollback_count: 0,
      confidence: name === 'claude-cli' ? 'medium' : 'high',
    });
  }

  process.stdout.write(JSON.stringify({ case: caseName, rows }, null, 2) + '\n');
  process.stdout.write('\n');
  process.stdout.write('provider'.padEnd(20) + 'before→after'.padEnd(14) + 'Δ'.padEnd(6) + 'pass%'.padEnd(8) + 'unverified'.padEnd(11) + 'duration_ms\n');
  process.stdout.write('-'.repeat(80) + '\n');
  for (const r of rows) {
    process.stdout.write(
      r.provider.padEnd(20) +
        `${r.score_before}→${r.score_after}`.padEnd(14) +
        `${r.score_delta >= 0 ? '+' : ''}${r.score_delta}`.padEnd(6) +
        `${Math.round(r.verification_pass_rate * 100)}%`.padEnd(8) +
        String(r.unverified_change_count).padEnd(11) +
        String(r.duration_ms) +
        '\n',
    );
  }
  return 0;
}
