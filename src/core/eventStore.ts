import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { IterationEvent, IterationSummary } from './types.js';
import { ensureDir, appendText, writeText, readTextSafe } from '../utils/fs.js';
import { writeJson, readJsonSafe } from '../utils/json.js';
import { eventsDir, iterationsDir } from '../utils/paths.js';
import { nowIso, shortId } from '../utils/time.js';

/**
 * Append-only iteration log. One JSONL file per iteration_id.
 * Persistent so QA Agent can learn across runs.
 */
export class EventStore {
  constructor(private projectPath: string) {}

  async append(event: Omit<IterationEvent, 'id' | 'timestamp'> & Partial<Pick<IterationEvent, 'id' | 'timestamp'>>): Promise<IterationEvent> {
    const full: IterationEvent = {
      id: event.id ?? shortId('evt'),
      timestamp: event.timestamp ?? nowIso(),
      ...event,
    } as IterationEvent;
    const file = path.join(eventsDir(this.projectPath), `${full.iteration_id}.jsonl`);
    await appendText(file, JSON.stringify(full) + '\n');
    return full;
  }

  async readIteration(iterationId: string): Promise<IterationEvent[]> {
    const file = path.join(eventsDir(this.projectPath), `${iterationId}.jsonl`);
    const txt = await readTextSafe(file);
    if (!txt) return [];
    return txt
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try { return JSON.parse(line) as IterationEvent; } catch { return null; }
      })
      .filter((x): x is IterationEvent => x !== null);
  }

  async readAll(): Promise<IterationEvent[]> {
    const dir = eventsDir(this.projectPath);
    let files: string[] = [];
    try {
      files = await fs.readdir(dir);
    } catch {
      return [];
    }
    const out: IterationEvent[] = [];
    for (const f of files.filter((x) => x.endsWith('.jsonl'))) {
      const txt = await readTextSafe(path.join(dir, f));
      if (!txt) continue;
      for (const line of txt.split('\n')) {
        if (!line) continue;
        try { out.push(JSON.parse(line) as IterationEvent); } catch { /* skip */ }
      }
    }
    return out;
  }

  async saveIterationSummary(summary: IterationSummary): Promise<string> {
    const dir = iterationsDir(this.projectPath);
    await ensureDir(dir);
    const file = path.join(dir, `${summary.iteration_id}.json`);
    await writeJson(file, summary);
    return file;
  }

  async loadIterationSummary(iterationId: string): Promise<IterationSummary | null> {
    const file = path.join(iterationsDir(this.projectPath), `${iterationId}.json`);
    return readJsonSafe<IterationSummary>(file);
  }
}
