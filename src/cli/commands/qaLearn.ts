import path from 'node:path';
import { readJsonSafe } from '../../utils/json.js';
import { QACaseStore } from '../../qa/QACaseStore.js';
import { generateCasesFromEvents } from '../../qa/QACaseGenerator.js';
import { dedupeCases } from '../../qa/QADeduplicator.js';
import { MemoryAgent } from '../../agents/MemoryAgent.js';
import type { IterationEvent } from '../../core/types.js';
import { flagString } from './_shared.js';

export async function qaLearn(flags: Record<string, string | boolean>): Promise<number> {
  const eventsFile = flagString(flags, 'events');
  const project = flagString(flags, 'project');
  if (!eventsFile || !project) {
    process.stderr.write('error: --events <file> and --project <path> are required\n');
    return 2;
  }
  const events = await readJsonSafe<IterationEvent[]>(path.resolve(eventsFile));
  if (!events || !Array.isArray(events)) {
    process.stderr.write(`error: could not read events JSON array from ${eventsFile}\n`);
    return 2;
  }
  const iterId = events[0]?.iteration_id ?? 'iter_manual';
  const memory = new MemoryAgent();
  memory.ingest(events);
  const raw = generateCasesFromEvents(events, iterId);
  const deduped = dedupeCases(raw);
  const store = new QACaseStore(path.resolve(project));
  const persisted = [];
  for (const c of deduped) {
    persisted.push(await store.upsert(memory.bumpFrequency(c)));
  }
  process.stdout.write(
    JSON.stringify(
      { learned: persisted.length, fingerprints: persisted.map((c) => c.fingerprint) },
      null,
      2,
    ) + '\n',
  );
  return 0;
}
