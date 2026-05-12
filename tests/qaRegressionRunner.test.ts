import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { runRegression } from '../src/qa/QARegressionRunner.js';
import { QACaseStore } from '../src/qa/QACaseStore.js';
import { EventStore } from '../src/core/eventStore.js';

async function tmpProject() {
  return fs.mkdtemp(path.join(tmpdir(), 'd2p-reg-'));
}

describe('QARegressionRunner', () => {
  let project: string;
  beforeEach(async () => { project = await tmpProject(); });

  it('passes all assertions on an empty project', async () => {
    const store = new QACaseStore(project);
    const spec = await store.readRegressionSpec(project);
    const res = await runRegression(project, spec);
    expect(res.total).toBe(spec.assertions.length);
    expect(res.failed).toBe(0);
  });

  it('fails missing_validation_after_code_change when an offending event exists', async () => {
    const evStore = new EventStore(project);
    await evStore.append({
      iteration_id: 'iter_x',
      agent: 'executor',
      event_type: 'task_completed',
      severity: 'info',
      message: 'wrote stuff',
      files_changed: ['a.js'],
      metadata: { commands_run: [] },
    });
    const store = new QACaseStore(project);
    const spec = await store.readRegressionSpec(project);
    const res = await runRegression(project, spec);
    const target = res.results.find((r) => r.assertion === 'missing_validation_after_code_change');
    expect(target?.passed).toBe(false);
  });
});
