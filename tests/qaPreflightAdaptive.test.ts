import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { QAAgent } from '../src/qa/QAAgent.js';
import { QACaseStore } from '../src/qa/QACaseStore.js';
import { MemoryAgent } from '../src/agents/MemoryAgent.js';
import { EventStore } from '../src/core/eventStore.js';
import { takeSnapshot } from '../src/core/projectSnapshot.js';
import type { QACase } from '../src/core/types.js';

async function tmpReactProj(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-prefa-'));
  await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'r', dependencies: { react: '^18', 'react-dom': '^18' } }));
  await fs.writeFile(path.join(dir, 'index.html'), '<html></html>');
  return dir;
}

function mkCase(over: Partial<QACase>): QACase {
  return {
    id: 'qa_x',
    title: 't', category: 'misc', severity: 'medium', frequency: 1,
    status: 'active', project_type: ['generic'],
    bug_source: { iteration_id: 'i', agent: 'qa', source: 's', related_files: [] },
    trigger_condition: '', human_flow: [], expected_behavior: '', actual_failure: '',
    regression_assertions: [], reproduction_steps: [], suggested_test_type: 'unit',
    fingerprint: 'fp_x',
    created_at: '2026-05-12T00:00:00.000Z',
    updated_at: '2026-05-12T00:00:00.000Z',
    last_seen_at: '2026-05-12T00:00:00.000Z',
    related_files: [],
    ...over,
  };
}

describe('Adaptive QA preflight', () => {
  it('skips cases excluded for the detected archetype', async () => {
    const proj = await tmpReactProj();
    const store = new QACaseStore(proj);
    await store.saveCases([
      mkCase({ id: 'a', fingerprint: 'a', transferability: {
        scope: 'workspace', portability_score: 0.9,
        applicable_archetypes: [], excluded_archetypes: ['react-app'],
        required_project_signals: [], excluded_project_signals: [],
        minimum_confidence: 'medium', examples_where_triggered: [],
        examples_where_prevented_failure: [], false_positive_contexts: [],
      } }),
      mkCase({ id: 'b', fingerprint: 'b', project_type: ['generic'] }), // legacy
    ]);
    const agent = new QAAgent(store, new MemoryAgent());
    const evStore = new EventStore(proj);
    const snap = await takeSnapshot(proj);
    const r = await agent.preflight('iter_x', snap, evStore);
    expect(r.archetype).toBe('react-app');
    expect(r.applicable).toBe(1); // legacy generic survives
    expect(r.skipped).toBe(1);    // react-app-excluded case dropped
  });
});
