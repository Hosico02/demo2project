import type { QACase } from '../core/types.js';
import { QACaseStore } from './QACaseStore.js';
import { clusterCases } from './QASimilarity.js';
import { retire, recomputeLifecycle, shouldAutoRetire } from './QACaseLifecycle.js';
import { dedupeCases } from './QADeduplicator.js';
import { nowIso, shortId } from '../utils/time.js';

/**
 * QAMemoryHealthManager (Phase 6).
 *
 * Long-running QA memory degrades unless governed. This module provides:
 *   - health metrics (memory_noise_score, memory_usefulness_score)
 *   - duplicate cluster detection (via QASimilarity)
 *   - merge / retire / promote suggestions
 *   - compact() to apply suggestions
 *
 * Conservative defaults: nothing is auto-retired unless caller opts in.
 */

export interface QAMemoryHealthReport {
  total_cases: number;
  active_cases: number;
  confirmed_cases: number;
  high_value_cases: number;
  noisy_cases: number;
  stale_cases: number;
  duplicate_clusters: { cluster_id: string; members: string[] }[];
  false_positive_rate: number;
  prevented_failure_count: number;
  memory_noise_score: number;        // 0..1, higher = noisier
  memory_usefulness_score: number;   // sum of usefulness_score
  recommended_merges: { case_a: string; case_b: string; reason: string }[];
  recommended_retirements: { id: string; fingerprint: string; reason: string }[];
  recommended_promotions: { id: string; fingerprint: string; reason: string }[];
  evidence_ids: string[];
  generated_at: string;
}

export async function reportMemoryHealth(projectPath: string): Promise<QAMemoryHealthReport> {
  const store = new QACaseStore(projectPath);
  const cases = (await store.loadCases()).map(recomputeLifecycle);

  const active = cases.filter((c) => c.lifecycle === 'active');
  const confirmed = cases.filter((c) => c.lifecycle === 'confirmed');
  const noisy = cases.filter((c) => c.lifecycle === 'noisy');
  const retired = cases.filter((c) => c.lifecycle === 'retired');
  const highValue = cases.filter((c) => (c.usefulness_score ?? 0) >= 5);

  const totalTp = cases.reduce((a, c) => a + (c.true_positive_count ?? 0), 0);
  const totalFp = cases.reduce((a, c) => a + (c.false_positive_count ?? 0), 0);
  const fpRate = totalTp + totalFp === 0 ? 0 : totalFp / (totalTp + totalFp);

  // Cluster + suggest merges
  const clusters = clusterCases(cases, { threshold: 0.55 });
  const dupClusters = clusters.filter((cl) => cl.members.length >= 2);
  const recommendedMerges: { case_a: string; case_b: string; reason: string }[] = [];
  for (const cl of dupClusters) {
    for (let i = 1; i < cl.members.length; i++) {
      recommendedMerges.push({
        case_a: cl.members[0]!,
        case_b: cl.members[i]!,
        reason: `cluster ${cl.cluster_id} share ${(cl.total_frequency)} sightings of representative ${cl.representative_fingerprint}`,
      });
    }
  }

  // Recommended retirements: noisy or stale or auto-retire candidates
  const recommendedRetirements: { id: string; fingerprint: string; reason: string }[] = [];
  for (const c of cases) {
    const decision = shouldAutoRetire(c);
    if (decision.retire) {
      recommendedRetirements.push({ id: c.id, fingerprint: c.fingerprint, reason: decision.reason ?? 'auto' });
    }
  }

  // Recommended promotions: high-frequency, low-FP active cases
  const recommendedPromotions = cases
    .filter((c) => c.lifecycle === 'active' && (c.true_positive_count ?? 0) >= 2 && (c.false_positive_count ?? 0) === 0)
    .map((c) => ({ id: c.id, fingerprint: c.fingerprint, reason: `TP=${c.true_positive_count} FP=0 — promote to confirmed` }));

  const noise = cases.length === 0 ? 0 : (noisy.length + recommendedRetirements.length) / Math.max(1, cases.length);
  const usefulness = cases.reduce((a, c) => a + (c.usefulness_score ?? 0), 0);

  return {
    total_cases: cases.length,
    active_cases: active.length,
    confirmed_cases: confirmed.length,
    high_value_cases: highValue.length,
    noisy_cases: noisy.length,
    stale_cases: retired.length, // proxy until last_triggered_at is universal
    duplicate_clusters: dupClusters.map((c) => ({ cluster_id: c.cluster_id, members: c.members })),
    false_positive_rate: Number(fpRate.toFixed(3)),
    prevented_failure_count: cases.reduce((a, c) => a + (c.last_prevented_failure_at ? 1 : 0), 0),
    memory_noise_score: Number(noise.toFixed(3)),
    memory_usefulness_score: usefulness,
    recommended_merges: recommendedMerges,
    recommended_retirements: recommendedRetirements,
    recommended_promotions: recommendedPromotions,
    evidence_ids: [],
    generated_at: nowIso(),
  };
}

export interface CompactResult {
  retired: number;
  merged: number;
  total_before: number;
  total_after: number;
}

/** Apply the recommendations conservatively. */
export async function compactMemory(projectPath: string, opts: { applyRetire?: boolean; applyMerge?: boolean } = {}): Promise<CompactResult> {
  const store = new QACaseStore(projectPath);
  const cases = (await store.loadCases()).map(recomputeLifecycle);
  const before = cases.length;
  let next = [...cases];
  let retired = 0, merged = 0;
  if (opts.applyRetire) {
    for (let i = 0; i < next.length; i++) {
      const dec = shouldAutoRetire(next[i]!);
      if (dec.retire) {
        next[i] = retire(next[i]!, dec.reason ?? 'auto');
        retired++;
      }
    }
  }
  if (opts.applyMerge) {
    // De-dupe by fingerprint as a safe merge proxy
    const deduped = dedupeCases(next);
    merged = next.length - deduped.length;
    next = deduped;
  }
  await store.saveCases(next);
  return { retired, merged, total_before: before, total_after: next.length };
}

export async function mergeCases(projectPath: string, idA: string, idB: string): Promise<{ ok: boolean; merged_into?: string }> {
  const store = new QACaseStore(projectPath);
  const cases = await store.loadCases();
  const a = cases.find((c) => c.id === idA || c.fingerprint === idA);
  const b = cases.find((c) => c.id === idB || c.fingerprint === idB);
  if (!a || !b) return { ok: false };
  const merged: QACase = {
    ...a,
    frequency: a.frequency + b.frequency,
    true_positive_count: (a.true_positive_count ?? 0) + (b.true_positive_count ?? 0),
    false_positive_count: (a.false_positive_count ?? 0) + (b.false_positive_count ?? 0),
    updated_at: nowIso(),
    last_seen_at: nowIso(),
    related_files: Array.from(new Set([...a.related_files, ...b.related_files])),
  };
  const next = cases.filter((c) => c.id !== b.id).map((c) => (c.id === a.id ? merged : c));
  await store.saveCases(next);
  return { ok: true, merged_into: a.id };
}

export async function retireStale(projectPath: string): Promise<{ retired: number; ids: string[] }> {
  const store = new QACaseStore(projectPath);
  const cases = await store.loadCases();
  const retiredIds: string[] = [];
  const next = cases.map((c) => {
    const dec = shouldAutoRetire(c);
    if (dec.retire) {
      retiredIds.push(c.id);
      return retire(c, dec.reason ?? 'stale');
    }
    return c;
  });
  await store.saveCases(next);
  void shortId; // marker
  return { retired: retiredIds.length, ids: retiredIds };
}
