import type { QACase } from '../core/types.js';

/**
 * Tiny dedup helper: merge a stream of QACases by fingerprint, preferring
 * the earliest `created_at` and the most-recent `last_seen_at`. The
 * QACaseStore.upsert does the persisted version; this exists for in-memory
 * pipelines (e.g. learning many events at once before persisting).
 */
export function dedupeCases(cases: QACase[]): QACase[] {
  const map = new Map<string, QACase>();
  for (const c of cases) {
    const prev = map.get(c.fingerprint);
    if (!prev) {
      map.set(c.fingerprint, c);
    } else {
      map.set(c.fingerprint, {
        ...prev,
        ...c,
        id: prev.id,
        created_at: prev.created_at < c.created_at ? prev.created_at : c.created_at,
        last_seen_at: prev.last_seen_at > c.last_seen_at ? prev.last_seen_at : c.last_seen_at,
        frequency: prev.frequency + c.frequency,
      });
    }
  }
  return Array.from(map.values());
}
