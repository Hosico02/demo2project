import type { IterationEvent, ProjectSnapshot, QACase, QARegressionSpec } from '../core/types.js';
import { QACaseStore } from './QACaseStore.js';
import { generateCasesFromEvents } from './QACaseGenerator.js';
import { dedupeCases } from './QADeduplicator.js';
import type { MemoryAgent } from '../agents/MemoryAgent.js';
import type { EventStore } from '../core/eventStore.js';

/**
 * QAAgent: learn from iteration events, persist QA cases, and maintain
 * the regression spec.
 *
 * Three responsibilities:
 *   1. preflight()   — before running an iteration, check known cases
 *                     against the current project state and emit warning
 *                     events the supervisor can react to.
 *   2. learnFromEvents() — read this iteration's events, generate cases,
 *                     dedupe, upsert.
 *   3. upsertRegressionSpec() — merge persisted cases into the
 *                     system-level qa-regression.spec.json file.
 */
export class QAAgent {
  constructor(
    private store: QACaseStore,
    private memory: MemoryAgent,
  ) {}

  async preflight(
    iterationId: string,
    _snapshot: ProjectSnapshot,
    eventStore: EventStore,
  ): Promise<{ active: number }> {
    const cases = await this.store.loadCases();
    const active = cases.filter((c) => c.status === 'active');
    await eventStore.append({
      iteration_id: iterationId,
      agent: 'qa',
      event_type: 'note',
      severity: 'info',
      message: `qa preflight: ${active.length} active case(s) loaded`,
      metadata: { active_cases: active.map((c) => c.fingerprint) },
    });
    return { active: active.length };
  }

  async learnFromEvents(
    iterationId: string,
    events: IterationEvent[],
    eventStore: EventStore,
  ): Promise<QACase[]> {
    const raw = generateCasesFromEvents(events, iterationId);
    const deduped = dedupeCases(raw);
    const persisted: QACase[] = [];
    for (const c of deduped) {
      const final = this.memory.bumpFrequency(c);
      const saved = await this.store.upsert(final);
      persisted.push(saved);
      await eventStore.append({
        iteration_id: iterationId,
        agent: 'qa',
        event_type: 'qa_case_created',
        severity: c.severity,
        message: `qa case upserted: ${saved.fingerprint}`,
        metadata: { fingerprint: saved.fingerprint, id: saved.id, frequency: saved.frequency },
      });
    }
    return persisted;
  }

  async upsertRegressionSpec(systemRoot: string): Promise<QARegressionSpec> {
    const cases = await this.store.loadCases();
    const spec = await this.store.readRegressionSpec(systemRoot);
    // merge — keep system spec's existing cases too, dedup by fingerprint
    const all = dedupeCases([...spec.cases, ...cases]);
    const updated: QARegressionSpec = {
      ...spec,
      cases: all,
    };
    await this.store.writeRegressionSpec(systemRoot, updated);
    return updated;
  }
}
