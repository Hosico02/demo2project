import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { runLongRunProductization } from '../src/eval/longRunProductization.js';
import { RuleBasedExecutor } from '../src/agents/providers/RuleBasedExecutor.js';
import { MockAgentProvider } from '../src/agents/providers/MockAgentProvider.js';
import { readJsonSafe } from '../src/utils/json.js';

async function tmpProj() {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-long-product-'));
  await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'long-product', main: 'app.js' }));
  await fs.writeFile(path.join(dir, 'app.js'), 'console.log("demo");\n');
  return dir;
}

describe('long-run productization orchestrator', () => {
  it('runs bounded rounds and records score/gap trends without mutating the source by default', async () => {
    const project = await tmpProj();
    const summary = await runLongRunProductization({
      projectPath: project,
      provider: new RuleBasedExecutor(),
      maxIterations: 2,
      targetScore: 100,
      maxNoProgressRounds: 2,
    });

    expect(summary.in_place).toBe(false);
    expect(summary.workspace_path).not.toBe(project);
    expect(summary.rounds_completed).toBeLessThanOrEqual(2);
    expect(summary.score_trend.length).toBe(summary.rounds_completed + 1);
    expect(summary.gap_count_trend.length).toBe(summary.score_trend.length);
    expect(summary.final_score).toBe(summary.score_trend.at(-1));
  });

  it('can stop before work when duration budget is already exhausted', async () => {
    const project = await tmpProj();
    const summary = await runLongRunProductization({
      projectPath: project,
      provider: new MockAgentProvider('noop'),
      durationMs: 0,
      maxIterations: 10,
    });

    expect(summary.rounds_completed).toBe(0);
    expect(summary.stop_reason).toBe('duration_limit_reached');
    expect(summary.score_trend).toHaveLength(1);
  });

  it('writes a resumable JSON report when outputPath is provided', async () => {
    const project = await tmpProj();
    const out = path.join(await fs.mkdtemp(path.join(tmpdir(), 'd2p-long-report-')), 'report.json');
    const summary = await runLongRunProductization({
      projectPath: project,
      provider: new MockAgentProvider('noop'),
      durationMs: 0,
      outputPath: out,
    });
    const saved = await readJsonSafe<typeof summary>(out);

    expect(summary.report_path).toBe(out);
    expect(saved?.report_path).toBe(out);
    expect(saved?.stop_reason).toBe('duration_limit_reached');
  });

  it('preserves existing demo2project process evidence in sandboxed long runs', async () => {
    const project = await tmpProj();
    await fs.mkdir(path.join(project, '.demo2project', 'iterations'), { recursive: true });
    await fs.writeFile(path.join(project, '.demo2project', 'iterations', 'iter_1.json'), '{"iteration_id":"iter_1"}\n');

    const summary = await runLongRunProductization({
      projectPath: project,
      provider: new MockAgentProvider('noop'),
      durationMs: 0,
    });

    await expect(fs.stat(path.join(summary.workspace_path, '.demo2project', 'iterations', 'iter_1.json'))).resolves.toBeTruthy();
  });

  it('does not count historical copied cost records as current long-run cost', async () => {
    const project = await tmpProj();
    await fs.mkdir(path.join(project, '.demo2project', 'cost'), { recursive: true });
    await fs.writeFile(path.join(project, '.demo2project', 'cost', 'old.json'), JSON.stringify({
      iteration_id: 'old',
      wall_time_ms: 999,
      command_time_ms: 999,
      provider_time_ms: 0,
      token_estimate: 1000000,
      command_count: 1,
      retry_count: 0,
      rollback_count: 0,
      cost_estimate_usd: 3,
      started_at: '2026-01-01T00:00:00.000Z',
      finished_at: '2026-01-01T00:00:01.000Z',
    }));

    const summary = await runLongRunProductization({
      projectPath: project,
      provider: new MockAgentProvider('noop'),
      durationMs: 0,
    });

    expect(summary.total_cost_estimate_usd).toBe(0);
    expect(summary.total_wall_time_ms).toBe(0);
  });
});
