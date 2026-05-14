import path from 'node:path';
import { MockAgentProvider } from '../../agents/providers/MockAgentProvider.js';
import { RuleBasedExecutor } from '../../agents/providers/RuleBasedExecutor.js';
import { MiniMaxProvider } from '../../agents/providers/MiniMaxProvider.js';
import type { AgentProvider } from '../../agents/providers/AgentProvider.js';
import { runLongRunProductization } from '../../eval/longRunProductization.js';
import { flagString, flagNumber, requireProject } from './_shared.js';

function pickProvider(name: string): AgentProvider {
  switch (name) {
    case 'rule-based':
      return new RuleBasedExecutor();
    case 'minimax':
    case 'minimax-m27':
      return new MiniMaxProvider({ enabled: true });
    case 'mock':
    default:
      return new MockAgentProvider('happy');
  }
}

export async function longRun(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const providerName = flagString(flags, 'provider', 'rule-based')!;
  const systemRoot = path.resolve(new URL('../../..', import.meta.url).pathname);
  const durationMs = parseDurationMs(flags);
  const output = flagString(flags, 'output');

  const summary = await runLongRunProductization({
    projectPath: project,
    provider: pickProvider(providerName),
    providerName,
    systemRoot,
    goal: flagString(flags, 'goal', 'demo-to-product'),
    maxIterations: flagNumber(flags, 'iterations', 10),
    durationMs,
    heartbeatMs: flagNumber(flags, 'heartbeat-seconds', 300) * 1000,
    targetScore: flagNumber(flags, 'target-score', 86),
    maxNoProgressRounds: flagNumber(flags, 'max-no-progress-rounds', 3),
    inPlace: flags['in-place'] === true || flags['in-place'] === 'true',
    outputPath: output ? path.resolve(output) : undefined,
    onHeartbeat(point) {
      process.stderr.write(
        `[long-run] iter=${point.iter} score=${point.score} gaps=${point.gap_count} docs_missing=${point.docs_truth_missing} qa=${point.qa_case_count}\n`,
      );
    },
  });

  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  return 0;
}

function parseDurationMs(flags: Record<string, string | boolean>): number | undefined {
  const hours = flagString(flags, 'hours') ?? flagString(flags, 'duration-hours');
  if (hours !== undefined) {
    const n = Number(hours);
    if (Number.isFinite(n) && n >= 0) return n * 60 * 60 * 1000;
  }
  const seconds = flagString(flags, 'max-seconds') ?? flagString(flags, 'duration-seconds');
  if (seconds !== undefined) {
    const n = Number(seconds);
    if (Number.isFinite(n) && n >= 0) return n * 1000;
  }
  return undefined;
}
