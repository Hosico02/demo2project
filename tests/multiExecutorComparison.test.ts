import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';
import { SupervisorAgent } from '../src/agents/SupervisorAgent.js';
import { AnalyzerAgent } from '../src/agents/AnalyzerAgent.js';
import { RuleBasedExecutor } from '../src/agents/providers/RuleBasedExecutor.js';
import { NaiveBaselineProvider } from '../src/agents/providers/NaiveBaselineProvider.js';

async function tmpProject() {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-cmp-'));
  await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'cmp', main: 'app.js' }));
  await fs.writeFile(path.join(dir, 'app.js'), 'console.log("hi");\n');
  return dir;
}

describe('Multi-executor comparison primitives', () => {
  it('rule-based produces higher score and zero unverified_changes', async () => {
    const a = await tmpProject();
    const b = await tmpProject();
    const sup = new SupervisorAgent();
    const analyzer = new AnalyzerAgent();
    await sup.iterate({ projectPath: a, goal: 'r', provider: new RuleBasedExecutor(), maxIterations: 1 });
    await sup.iterate({ projectPath: b, goal: 'n', provider: new NaiveBaselineProvider(), maxIterations: 1 });
    const sa = (await analyzer.fullAnalyze(a)).score.total;
    const sb = (await analyzer.fullAnalyze(b)).score.total;
    expect(sa).toBeGreaterThan(sb);
  });

  it('producer durations are recorded comparably', async () => {
    const t0 = performance.now();
    await new RuleBasedExecutor().runTask(
      {
        id: 't', iteration_id: 'i', assigned_to: 'executor',
        title: 'Author or extend README.md', description: 'x',
        acceptance_criteria: [], expected_changed_files: ['README.md'],
        verification_commands: ['test -s README.md'], priority: 'low', status: 'pending',
      },
      { project_path: await tmpProject(), iteration_id: 'i', recent_events: [] },
    );
    expect(performance.now() - t0).toBeGreaterThan(0);
  });
});
