import type { QACase } from '../core/types.js';

/**
 * QASimilarity — Phase-3 *slice*: lightweight, dependency-free similarity
 * clustering for QA cases. Uses Jaccard similarity over a tokenized signal
 * (title + trigger + actual_failure). No embedding model required, runs
 * synchronously, deterministic.
 *
 * Suitable for v0.0.1 as a stepping stone before real embeddings arrive in a
 * later phase.
 */

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9_\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 3),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersect = 0;
  for (const t of a) if (b.has(t)) intersect++;
  const union = a.size + b.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

function signal(c: QACase): Set<string> {
  return tokenize(`${c.title} ${c.trigger_condition} ${c.actual_failure} ${c.category}`);
}

export interface QACluster {
  cluster_id: string;
  members: string[]; // case ids
  representative_fingerprint: string;
  total_frequency: number;
}

export interface SimilarityOptions {
  threshold?: number; // 0..1, default 0.45
}

/**
 * Cluster cases by greedy single-pass: each case joins the first existing
 * cluster whose representative similarity >= threshold; otherwise starts a
 * new cluster. Order-dependent, but good enough as a Phase-3 slice.
 */
export function clusterCases(cases: QACase[], opts: SimilarityOptions = {}): QACluster[] {
  const threshold = opts.threshold ?? 0.45;
  const clusters: { rep: QACase; repSig: Set<string>; members: QACase[] }[] = [];
  for (const c of cases) {
    const sig = signal(c);
    let placed = false;
    for (const cl of clusters) {
      if (jaccard(sig, cl.repSig) >= threshold) {
        cl.members.push(c);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push({ rep: c, repSig: sig, members: [c] });
  }
  return clusters.map((cl, idx) => ({
    cluster_id: `cluster_${idx + 1}`,
    members: cl.members.map((m) => m.id),
    representative_fingerprint: cl.rep.fingerprint,
    total_frequency: cl.members.reduce((s, m) => s + m.frequency, 0),
  }));
}

/** Return the closest existing case to a candidate, or null if below threshold. */
export function findClosest(
  candidate: QACase,
  pool: QACase[],
  opts: SimilarityOptions = {},
): { case: QACase; score: number } | null {
  const threshold = opts.threshold ?? 0.45;
  const sig = signal(candidate);
  let best: { case: QACase; score: number } | null = null;
  for (const c of pool) {
    if (c.fingerprint === candidate.fingerprint) continue;
    const score = jaccard(sig, signal(c));
    if (score >= threshold && (best === null || score > best.score)) {
      best = { case: c, score };
    }
  }
  return best;
}
