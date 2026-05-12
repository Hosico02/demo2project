import { CostTracker } from '../../core/costTracker.js';
import { flagString, requireProject } from './_shared.js';

export async function costReport(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const iter = flagString(flags, 'iteration');
  const all = await CostTracker.readAll(project);
  if (all.length === 0) {
    process.stderr.write('no cost records found\n');
    return 1;
  }
  const rows = iter ? all.filter((r) => r.iteration_id === iter) : all;
  const totals = rows.reduce(
    (acc, r) => {
      acc.wall_time_ms += r.wall_time_ms;
      acc.command_time_ms += r.command_time_ms;
      acc.provider_time_ms += r.provider_time_ms;
      acc.token_estimate += r.token_estimate;
      acc.command_count += r.command_count;
      acc.retry_count += r.retry_count;
      acc.rollback_count += r.rollback_count;
      acc.cost_estimate_usd += r.cost_estimate_usd;
      acc.score_delta += r.score_delta ?? 0;
      return acc;
    },
    { wall_time_ms: 0, command_time_ms: 0, provider_time_ms: 0, token_estimate: 0, command_count: 0, retry_count: 0, rollback_count: 0, cost_estimate_usd: 0, score_delta: 0 },
  );
  process.stdout.write(JSON.stringify({ iterations: rows.length, rows, totals }, null, 2) + '\n');
  return 0;
}
