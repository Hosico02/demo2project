import type { QACase, QACaseLifecycle } from '../core/types.js';
import { nowIso } from '../utils/time.js';

/**
 * Phase-3 QA case lifecycle.
 *
 * Transitions:
 *   new       -> active    (first preflight reference)
 *   active    -> confirmed (true_positive_count >= 2)
 *   active    -> noisy     (FP > TP and total signals >= 3)
 *   any       -> retired   (manual or auto)
 *
 * `recomputeLifecycle` is idempotent and safe to call on any QACase.
 */

export interface LifecycleSignals {
  was_referenced_in_preflight?: boolean;
  produced_true_positive?: boolean;
  produced_false_positive?: boolean;
}

export function recordSignal(c: QACase, sig: LifecycleSignals): QACase {
  const out: QACase = { ...c };
  out.true_positive_count = (out.true_positive_count ?? 0) + (sig.produced_true_positive ? 1 : 0);
  out.false_positive_count = (out.false_positive_count ?? 0) + (sig.produced_false_positive ? 1 : 0);
  if (sig.was_referenced_in_preflight) out.last_triggered_at = nowIso();
  if (sig.produced_true_positive) out.last_prevented_failure_at = nowIso();
  return recomputeLifecycle(out);
}

export function recomputeLifecycle(c: QACase): QACase {
  if (c.lifecycle === 'retired') return c;
  const tp = c.true_positive_count ?? 0;
  const fp = c.false_positive_count ?? 0;
  const refs = c.last_triggered_at ? 1 : 0;
  let lifecycle: QACaseLifecycle = c.lifecycle ?? 'new';

  if (tp >= 2) {
    lifecycle = 'confirmed';
  } else if (refs > 0 || tp > 0 || fp > 0) {
    if (fp > tp && tp + fp >= 3) lifecycle = 'noisy';
    else lifecycle = 'active';
  } else {
    lifecycle = 'new';
  }
  return {
    ...c,
    lifecycle,
    usefulness_score: Math.max(0, tp * 3 - fp * 2 + (lifecycle === 'confirmed' ? 5 : 0)),
  };
}

export function retire(c: QACase, reason: string): QACase {
  return {
    ...c,
    lifecycle: 'retired',
    retired_at: nowIso(),
    retirement_reason: reason,
    status: 'archived',
  };
}

export function promote(c: QACase): QACase {
  return {
    ...c,
    lifecycle: 'confirmed',
    manual_review_required: false,
    true_positive_count: Math.max(c.true_positive_count ?? 0, 2),
    usefulness_score: Math.max(c.usefulness_score ?? 0, 10),
  };
}

/** Auto-retirement heuristic — invoked by qa:audit. */
export function shouldAutoRetire(c: QACase, opts: { maxAgeDays?: number } = {}): { retire: boolean; reason?: string } {
  if (c.lifecycle === 'retired') return { retire: false };
  if (c.lifecycle === 'noisy' && (c.false_positive_count ?? 0) >= 5) {
    return { retire: true, reason: 'noisy_high_fp' };
  }
  if (c.last_triggered_at) {
    const ageMs = Date.now() - Date.parse(c.last_triggered_at);
    const maxAgeMs = (opts.maxAgeDays ?? 180) * 24 * 3600 * 1000;
    if (Number.isFinite(ageMs) && ageMs > maxAgeMs) {
      return { retire: true, reason: 'stale' };
    }
  }
  return { retire: false };
}
