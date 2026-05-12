import path from 'node:path';
import { promises as fs } from 'node:fs';
import { readJsonSafe, writeJson } from '../utils/json.js';
import { ensureDir } from '../utils/fs.js';
import { nowIso, shortId } from '../utils/time.js';
import type { LearningPattern } from './crossProjectLearning.js';
import { loadPatterns } from './crossProjectLearning.js';

/**
 * LearningGovernance (Phase 5) — promotion approval workflow.
 *
 * Promotion rules (codified, conservative):
 *
 *   repo -> workspace:
 *     - ≥ 2 distinct source projects
 *     - false_positive contradictions ≤ support / 3
 *     - not pattern_type in {dangerous: 'safety_failure/*'}  (those need
 *       human approval regardless)
 *
 *   workspace -> global:
 *     - ≥ 3 distinct archetypes OR ≥ 5 distinct projects
 *     - manual_approved=true (CLI: learning:approve)
 *     - clear applicable / excluded conditions present
 *
 * Approved promotions emit a "promotion record" that downstream code can
 * apply (e.g. QA Agent upserts a workspace-scope case from the pattern).
 */

export type Scope = 'repo' | 'workspace' | 'global';

export interface PromotionCandidate {
  id: string;
  source_pattern: string; // pattern id
  current_scope: Scope;
  proposed_scope: Scope;
  evidence_summary: string;
  support_count: number;
  contradiction_count: number;
  false_positive_rate: number;
  risk_level: 'low' | 'medium' | 'high';
  recommendation: 'approve' | 'reject' | 'manual_review';
  requires_manual_approval: boolean;
  decision_status: 'pending' | 'approved' | 'rejected';
  approver?: string;
  decided_at?: string;
  decision_note?: string;
  created_at: string;
}

function dir(systemRoot: string): string {
  return path.join(systemRoot, 'corpus', 'learning', 'governance');
}

export async function buildCandidates(systemRoot: string): Promise<PromotionCandidate[]> {
  const patterns = await loadPatterns(systemRoot);
  const out: PromotionCandidate[] = [];
  for (const p of patterns) {
    if (p.promoted_to_qa_case) continue;
    const fpRate = p.contradiction_count / Math.max(1, p.support_count + p.contradiction_count);

    // repo -> workspace
    if (p.source_projects.length >= 2 && fpRate <= 1 / 3) {
      const risk: 'low' | 'medium' | 'high' = p.pattern_type === 'safety_failure' as never ? 'high' : 'low';
      out.push({
        id: shortId('cand'),
        source_pattern: p.id,
        current_scope: 'repo',
        proposed_scope: 'workspace',
        evidence_summary: `${p.title} (${p.source_projects.length} projects, ${p.support_count} occurrences)`,
        support_count: p.support_count,
        contradiction_count: p.contradiction_count,
        false_positive_rate: Number(fpRate.toFixed(3)),
        risk_level: risk,
        recommendation: risk === 'high' ? 'manual_review' : 'approve',
        requires_manual_approval: risk !== 'low',
        decision_status: 'pending',
        created_at: nowIso(),
      });
    }

    // workspace -> global
    const distinctArchs = new Set(p.applicable_archetypes).size;
    if (distinctArchs >= 3 || p.source_projects.length >= 5) {
      out.push({
        id: shortId('cand'),
        source_pattern: p.id,
        current_scope: 'workspace',
        proposed_scope: 'global',
        evidence_summary: `${p.title} (archetypes=${distinctArchs}, projects=${p.source_projects.length})`,
        support_count: p.support_count,
        contradiction_count: p.contradiction_count,
        false_positive_rate: Number(fpRate.toFixed(3)),
        risk_level: 'medium',
        recommendation: 'manual_review',
        requires_manual_approval: true,
        decision_status: 'pending',
        created_at: nowIso(),
      });
    }
  }
  const d = dir(systemRoot);
  await ensureDir(d);
  await writeJson(path.join(d, 'candidates.json'), out);
  return out;
}

export async function listCandidates(systemRoot: string): Promise<PromotionCandidate[]> {
  const v = await readJsonSafe<PromotionCandidate[]>(path.join(dir(systemRoot), 'candidates.json'));
  return v ?? [];
}

export async function decideCandidate(opts: {
  systemRoot: string;
  id: string;
  decision: 'approved' | 'rejected';
  note?: string;
}): Promise<PromotionCandidate | null> {
  const cands = await listCandidates(opts.systemRoot);
  const idx = cands.findIndex((c) => c.id === opts.id);
  if (idx === -1) return null;
  cands[idx] = {
    ...cands[idx]!,
    decision_status: opts.decision,
    decided_at: nowIso(),
    decision_note: opts.note,
    approver: process.env.USER ?? 'human',
  };
  await writeJson(path.join(dir(opts.systemRoot), 'candidates.json'), cands);
  return cands[idx]!;
}

export async function explainCandidate(systemRoot: string, id: string): Promise<{
  candidate: PromotionCandidate | null;
  pattern: LearningPattern | null;
}> {
  const cands = await listCandidates(systemRoot);
  const c = cands.find((x) => x.id === id) ?? null;
  const patterns = await loadPatterns(systemRoot);
  const p = c ? patterns.find((pp) => pp.id === c.source_pattern) ?? null : null;
  return { candidate: c, pattern: p };
}
