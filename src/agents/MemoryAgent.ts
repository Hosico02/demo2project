import type { IterationEvent, QACase } from '../core/types.js';

/**
 * MemoryAgent: short, structured memory across iterations.
 *
 * Responsibilities (MVP):
 *  - Compute fingerprints for failure events so QA can dedup.
 *  - Count how often a fingerprint has been seen.
 *  - Detect "same failure repeating across iterations".
 *
 * Stays in-process (no DB). Persistence is handled by QACaseStore.
 */
export class MemoryAgent {
  private fingerprintCounts = new Map<string, number>();
  private fingerprintLastIteration = new Map<string, string>();

  ingest(events: IterationEvent[]): void {
    for (const ev of events) {
      const fp = fingerprintForEvent(ev);
      if (!fp) continue;
      this.fingerprintCounts.set(fp, (this.fingerprintCounts.get(fp) ?? 0) + 1);
      this.fingerprintLastIteration.set(fp, ev.iteration_id);
    }
  }

  countOf(fingerprint: string): number {
    return this.fingerprintCounts.get(fingerprint) ?? 0;
  }

  isRecurring(fingerprint: string, threshold = 2): boolean {
    return this.countOf(fingerprint) >= threshold;
  }

  /** Combine memory-derived frequency with a freshly-built QA case. */
  bumpFrequency(caseObj: QACase): QACase {
    const fp = caseObj.fingerprint;
    const fromMemory = this.countOf(fp);
    if (fromMemory > caseObj.frequency) {
      return { ...caseObj, frequency: fromMemory };
    }
    return caseObj;
  }
}

/**
 * Stable fingerprint for failure-shaped events. Stays category-level —
 * we explicitly do NOT include timestamps, ids, or file paths so that the
 * "same kind of bug" hashes to the same value across iterations.
 */
export function fingerprintForEvent(ev: IterationEvent): string | null {
  if (ev.event_type === 'verification_failed') {
    return `verification_failed:${normalizeCommand(ev.command ?? '')}`;
  }
  if (ev.event_type === 'task_failed') {
    return `task_failed:${ev.metadata?.['rule'] ?? 'unspecified'}`;
  }
  if (ev.event_type === 'review_finding' && ev.metadata?.['rule']) {
    return `review:${String(ev.metadata['rule'])}`;
  }
  if (ev.event_type === 'qa_case_created' && ev.metadata?.['fingerprint']) {
    return String(ev.metadata['fingerprint']);
  }
  return null;
}

function normalizeCommand(cmd: string): string {
  // strip arguments after the binary, collapse whitespace
  return cmd.trim().split(/\s+/).slice(0, 2).join(' ').toLowerCase();
}
