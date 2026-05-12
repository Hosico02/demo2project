import type { IterationEvent, ProjectSnapshot, QACase, QARegressionSpec } from '../core/types.js';
import { QACaseStore } from './QACaseStore.js';
import { generateCasesFromEvents } from './QACaseGenerator.js';
import { dedupeCases } from './QADeduplicator.js';
import type { MemoryAgent } from '../agents/MemoryAgent.js';
import type { EventStore } from '../core/eventStore.js';
import { loadAllScopes, selectForSnapshot } from './QAMemoryScopes.js';

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
  ): Promise<{ active: number; scopes: { global: number; workspace: number; repo: number } }> {
    let scoped = { global: [] as QACase[], workspace: [] as QACase[], repo: [] as QACase[] };
    if (opts.systemRoot) {
      scoped = await loadAllScopes({
        projectPath: snapshot.project_path,
        systemRoot: opts.systemRoot,
      });
    }
    const repoLegacy = await this.store.loadCases(); // existing per-project store
    const repoMerged = dedupeCases([...scoped.repo, ...repoLegacy]);
    const all = selectForSnapshot({ global: scoped.global, workspace: scoped.workspace, repo: repoMerged }, snapshot);
    const active = all.filter((c) => c.status === 'active');

    await eventStore.append({
      iteration_id: iterationId,
      agent: 'qa',
      event_type: 'note',
      severity: 'info',
      message: `qa preflight: ${active.length} active case(s) across scopes (g=${scoped.global.length} w=${scoped.workspace.length} r=${repoMerged.length})`,
      metadata: {
        active_fingerprints: active.map((c) => c.fingerprint),
        scope_counts: { global: scoped.global.length, workspace: scoped.workspace.length, repo: repoMerged.length },
      },
    });
    return {
      active: active.length,
      scopes: { global: scoped.global.length, workspace: scoped.workspace.length, repo: repoMerged.length },
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
