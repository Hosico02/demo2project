import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { SupervisorAgent } from '../src/agents/SupervisorAgent.js';
import { MockAgentProvider } from '../src/agents/providers/MockAgentProvider.js';
import { QACaseStore } from '../src/qa/QACaseStore.js';
import { runRegression } from '../src/qa/QARegressionRunner.js';

async function mkProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-eff-'));
  await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'eff', main: 'app.js' }));
  await fs.writeFile(path.join(dir, 'app.js'), 'console.log(1);\n');
  return dir;
}

describe('Regression effectiveness — end-to-end loop', () => {
  it('first iteration produces missing_validation QA case; second iteration sees it at preflight', async () => {
    const proj = await mkProject();
    const sup = new SupervisorAgent();

    // First run with a provider that trips missing_validation
    await sup.iterate({
      projectPath: proj,
      goal: 'first',
      provider: new MockAgentProvider('change_without_verify'),
      maxIterations: 1,
    });
    const store = new QACaseStore(proj);
    const afterFirst = await store.loadCases();
    expect(afterFirst.some((c) => c.fingerprint === 'missing_validation_after_code_change')).toBe(true);

    // Second run — preflight should observe at least one active case
    const secondSummaries = await sup.iterate({
      projectPath: proj,
      goal: 'second',
      provider: new MockAgentProvider('happy'),
      maxIterations: 1,
    });
    expect(secondSummaries.length).toBe(1);
  });

  it('Supervisor refuses to mark unverified completed even when the same fingerprint is in memory', async () => {
    const proj = await mkProject();
    const sup = new SupervisorAgent();
    const summaries = await sup.iterate({
      projectPath: proj,
      goal: 'second-trip',
      provider: new MockAgentProvider('change_without_verify'),
      maxIterations: 1,
    });
    const completed = summaries[0]!.executor_results.filter(
      (r) => r.status === 'completed' && r.changed_files.length > 0 && r.verification_evidence.length === 0,
    );
    expect(completed.length).toBe(0);
  });

  it('regression runner replays workflow assertions over recorded history', async () => {
    const proj = await mkProject();
    const sup = new SupervisorAgent();
    await sup.iterate({
      projectPath: proj,
      goal: 'fill-history',
      provider: new MockAgentProvider('change_without_verify'),
      maxIterations: 1,
    });
    const store = new QACaseStore(proj);
    const spec = await store.readRegressionSpec(proj);
    const result = await runRegression(proj, spec);
    expect(result.total).toBe(spec.assertions.length);
    expect(result.results.some((r) => r.assertion === 'missing_validation_after_code_change')).toBe(true);
  });
});
