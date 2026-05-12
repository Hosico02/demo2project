import type { IterationEvent, ProjectSnapshot, QACase, QARegressionSpec } from '../core/types.js';
import { QACaseStore } from './QACaseStore.js';
import { generateCasesFromEvents } from './QACaseGenerator.js';
import { dedupeCases } from './QADeduplicator.js';
import type { MemoryAgent } from '../agents/MemoryAgent.js';
import type { EventStore } from '../core/eventStore.js';
import { loadAllScopes, selectForSnapshot } from './QAMemoryScopes.js';
import { detectArchetype } from '../core/projectArchetypeDetector.js';
import { applicableForArchetype, evaluateTransfer } from './QATransferability.js';

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
    snapshot: ProjectSnapshot,
    eventStore: EventStore,
    opts: { systemRoot?: string } = {},
  ): Promise<{
    active: number;
    scopes: { global: number; workspace: number; repo: number };
    archetype?: string;
    applicable: number;
    skipped: number;
  }> {
    let scoped = { global: [] as QACase[], workspace: [] as QACase[], repo: [] as QACase[] };
    if (opts.systemRoot) {
      scoped = await loadAllScopes({
        projectPath: snapshot.project_path,
        systemRoot: opts.systemRoot,
      });
    }
    const repoLegacy = await this.store.loadCases();
    const repoMerged = dedupeCases([...scoped.repo, ...repoLegacy]);
    const allLegacy = selectForSnapshot({ global: scoped.global, workspace: scoped.workspace, repo: repoMerged }, snapshot);
    const activeLegacy = allLegacy.filter((c) => c.status === 'active');

    // Phase-5: adaptive preflight uses archetype + transferability evaluator
    const archetype = (await detectArchetype(snapshot.project_path)).primary;
    const applicable = applicableForArchetype(activeLegacy, archetype);
    const skipped = activeLegacy.filter((c) => !applicable.includes(c));

    await eventStore.append({
      iteration_id: iterationId,
      agent: 'qa',
      event_type: 'note',
      severity: 'info',
      message: `qa preflight (adaptive): archetype=${archetype.id} applicable=${applicable.length}/${activeLegacy.length}`,
      metadata: {
        archetype: archetype.id,
        archetype_confidence: archetype.confidence,
        applicable_fingerprints: applicable.map((c) => c.fingerprint),
        skipped_reasons: skipped.map((c) => ({ fingerprint: c.fingerprint, reason: evaluateTransfer(c, archetype).reason })),
        scope_counts: { global: scoped.global.length, workspace: scoped.workspace.length, repo: repoMerged.length },
      },
    });

    return {
      active: applicable.length,
      scopes: { global: scoped.global.length, workspace: scoped.workspace.length, repo: repoMerged.length },
      archetype: archetype.id,
      applicable: applicable.length,
      skipped: skipped.length,
    };
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
