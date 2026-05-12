import type { QACase } from '../core/types.js';
import type { ProjectArchetype } from '../core/projectArchetypeDetector.js';

/**
 * TransferabilityEvaluator (Phase 5) — decides whether a QA case should
 * apply to the project at hand.
 *
 * Rules of thumb (codified below):
 *   - If `transferability` is absent, treat as portability=medium and
 *     project_type-only match (legacy behavior).
 *   - Hard excludes win: an archetype on `excluded_archetypes` is never a
 *     fit, even if `portability_score` is high.
 *   - Required signals: ALL of `required_project_signals` must be present
 *     in the archetype's detected signals.
 *   - Excluded signals: any match disqualifies.
 *   - portability_score acts as a tiebreaker / ranking weight.
 *   - cases with FP > TP and noisy lifecycle are filtered out regardless.
 */

export interface TransferDecision {
  applicable: boolean;
  reason: string;
  rank: number; // higher = more relevant
}

export function evaluateTransfer(
  qa: QACase,
  archetype: ProjectArchetype,
): TransferDecision {
  // 1. Noisy / retired cases never auto-apply.
  if (qa.lifecycle === 'retired') {
    return { applicable: false, reason: 'retired', rank: 0 };
  }
  if (qa.lifecycle === 'noisy') {
    return { applicable: false, reason: 'noisy', rank: 0 };
  }
  if ((qa.false_positive_count ?? 0) > (qa.true_positive_count ?? 0) + 1) {
    return { applicable: false, reason: 'fp_exceeds_tp', rank: 0 };
  }

  const t = qa.transferability;
  // Legacy fallback: cases without transferability metadata default to
  // project_type-based filtering.
  if (!t) {
    if (qa.project_type.length === 0 || qa.project_type.includes('generic')) {
      return { applicable: true, reason: 'legacy_generic', rank: 0.5 };
    }
    if (qa.project_type.includes(archetype.id)) {
      return { applicable: true, reason: 'legacy_archetype_match', rank: 0.6 };
    }
    return { applicable: false, reason: 'legacy_archetype_mismatch', rank: 0 };
  }

  // Hard excludes
  if (t.excluded_archetypes.includes(archetype.id)) {
    return { applicable: false, reason: `excluded_archetype:${archetype.id}`, rank: 0 };
  }
  for (const sig of t.excluded_project_signals) {
    if (archetype.detected_signals.some((s) => s.includes(sig))) {
      return { applicable: false, reason: `excluded_signal:${sig}`, rank: 0 };
    }
  }

  // Required signals
  for (const sig of t.required_project_signals) {
    if (!archetype.detected_signals.some((s) => s.includes(sig))) {
      return { applicable: false, reason: `missing_signal:${sig}`, rank: 0 };
    }
  }

  // Applicable archetype list (empty = "all not excluded")
  if (t.applicable_archetypes.length > 0 && !t.applicable_archetypes.includes(archetype.id)) {
    return { applicable: false, reason: `archetype_not_in_applicable_list:${archetype.id}`, rank: 0 };
  }

  // Rank: portability + lifecycle boost
  let rank = Math.max(0, Math.min(1, t.portability_score));
  if (qa.lifecycle === 'confirmed') rank += 0.3;
  if (qa.usefulness_score) rank += Math.min(0.5, qa.usefulness_score / 20);
  return { applicable: true, reason: 'transferable', rank: Number(rank.toFixed(3)) };
}

/** Bulk filter + sort. */
export function applicableForArchetype(cases: QACase[], archetype: ProjectArchetype): QACase[] {
  const decisions = cases.map((c) => ({ c, d: evaluateTransfer(c, archetype) }));
  return decisions
    .filter((x) => x.d.applicable)
    .sort((a, b) => b.d.rank - a.d.rank)
    .map((x) => x.c);
}

export function explainTransfer(qa: QACase, archetype: ProjectArchetype): TransferDecision & { fingerprint: string; id: string } {
  const d = evaluateTransfer(qa, archetype);
  return { ...d, fingerprint: qa.fingerprint, id: qa.id };
}
