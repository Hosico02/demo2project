import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { SupervisorAgent } from '../src/agents/SupervisorAgent.js';
import { AnalyzerAgent } from '../src/agents/AnalyzerAgent.js';
import { RuleBasedExecutor } from '../src/agents/providers/RuleBasedExecutor.js';
import { CostTracker } from '../src/core/costTracker.js';
import { QACaseStore } from '../src/qa/QACaseStore.js';

async function tmpProj() {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-long-'));
  await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'l', main: 'app.js' }));
  await fs.writeFile(path.join(dir, 'app.js'), 'console.log(1);\n');
  return dir;
}

describe('Long-horizon evaluation primitives', () => {
  it('three rounds: score never regresses for rule-based, qa memory does not shrink', async () => {
    const proj = await tmpProj();
    const analyzer = new AnalyzerAgent();
    const sup = new SupervisorAgent();
    const scores: number[] = [];
    const memSizes: number[] = [];
    scores.push((await analyzer.fullAnalyze(proj)).score.total);
    for (let i = 0; i < 3; i++) {
      await sup.iterate({ projectPath: proj, goal: `r${i}`, provider: new RuleBasedExecutor(), maxIterations: 1 });
      scores.push((await analyzer.fullAnalyze(proj)).score.total);
      memSizes.push((await new QACaseStore(proj).loadCases()).length);
    }
    for (let i = 1; i < scores.length; i++) expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]!);
    for (let i = 1; i < memSizes.length; i++) expect(memSizes[i]).toBeGreaterThanOrEqual(memSizes[i - 1]!);
  });

  it('cost records accumulate per iteration', async () => {
    const proj = await tmpProj();
    const sup = new SupervisorAgent();
    await sup.iterate({ projectPath: proj, goal: 'c', provider: new RuleBasedExecutor(), maxIterations: 2 });
    const all = await CostTracker.readAll(proj);
    expect(all.length).toBeGreaterThanOrEqual(1);
  });
});
