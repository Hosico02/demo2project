import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import type { IterationEvent } from '../src/core/types.js';
import { QACaseStore } from '../src/qa/QACaseStore.js';
import { generateCasesFromEvents } from '../src/qa/QACaseGenerator.js';
import { dedupeCases } from '../src/qa/QADeduplicator.js';
import { QAAgent } from '../src/qa/QAAgent.js';
import { MemoryAgent } from '../src/agents/MemoryAgent.js';
import { EventStore } from '../src/core/eventStore.js';

async function makeTmpProject(): Promise<string> {
  const p = await fs.mkdtemp(path.join(tmpdir(), 'd2p-qa-'));
  return p;
}

const codeChangeNoVerifyEvent: IterationEvent = {
  id: 'evt_1',
  iteration_id: 'iter_test_1',
  timestamp: new Date().toISOString(),
  agent: 'executor',
  event_type: 'task_completed',
  severity: 'info',
  message: 'wrote a file',
  files_changed: ['app.js'],
  metadata: { commands_run: [] as string[] },
};

describe('QA generator + deduper', () => {
  it('detects missing_validation_after_code_change', () => {
    const cases = generateCasesFromEvents([codeChangeNoVerifyEvent], 'iter_test_1');
    expect(cases.some((c) => c.fingerprint === 'missing_validation_after_code_change')).toBe(true);
  });

  it('dedupes cases sharing a fingerprint and sums frequency', () => {
    const a = generateCasesFromEvents([codeChangeNoVerifyEvent], 'iter_test_1')[0]!;
    const b = { ...a, id: 'qa_b' };
    const out = dedupeCases([a, b]);
    expect(out.length).toBe(1);
    expect(out[0]!.frequency).toBe(2);
  });
});

describe('QAAgent.learnFromEvents', () => {
  let projectPath: string;
  beforeEach(async () => {
    projectPath = await makeTmpProject();
  });

  it('persists a case and increments frequency on second sighting', async () => {
    const store = new QACaseStore(projectPath);
    const memory = new MemoryAgent();
    const agent = new QAAgent(store, memory);
    const evStore = new EventStore(projectPath);

    await agent.learnFromEvents('iter_test_1', [codeChangeNoVerifyEvent], evStore);
    const firstLoaded = await store.loadCases();
    expect(firstLoaded.length).toBe(1);
    expect(firstLoaded[0]!.frequency).toBe(1);

    // ingest events into memory so MemoryAgent.bumpFrequency reflects it
    memory.ingest([
      { ...codeChangeNoVerifyEvent, id: 'evt_2', iteration_id: 'iter_test_2' },
    ]);
    await agent.learnFromEvents(
      'iter_test_2',
      [{ ...codeChangeNoVerifyEvent, id: 'evt_3', iteration_id: 'iter_test_2' }],
      evStore,
    );
    const secondLoaded = await store.loadCases();
    expect(secondLoaded.length).toBe(1);
    expect(secondLoaded[0]!.frequency).toBeGreaterThan(1);
  });
});
