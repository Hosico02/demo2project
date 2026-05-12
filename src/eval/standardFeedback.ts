import path from 'node:path';
import { promises as fs } from 'node:fs';
import { writeJson, readJsonSafe } from '../utils/json.js';
import { ensureDir } from '../utils/fs.js';
import { nowIso, shortId } from '../utils/time.js';
import type { AnonymizedCorpusReport } from './projectCorpus.js';

/**
 * StandardFeedbackLoop (Phase 5).
 *
 * Reads the anonymized corpus reports and emits StandardUpdateSuggestions.
 * Suggestions are NEVER applied automatically; they're queued for human
 * review via `standards:approve-update` / `standards:reject-update`.
 */

export interface StandardUpdateSuggestion {
  id: string;
  standard_id: string; // archetype name
  reason: string;
  evidence_ids: string[]; // corpus report ids
  proposed_change: string;
  risk_level: 'low' | 'medium' | 'high';
  expected_impact: string;
  requires_manual_approval: boolean;
  status: 'pending' | 'approved' | 'rejected';
  approver?: string;
  decided_at?: string;
  created_at: string;
}

function suggestionsPath(systemRoot: string): string {
  return path.join(systemRoot, 'corpus', 'learning', 'standard-suggestions.json');
}

export async function suggestStandardUpdates(systemRoot: string): Promise<StandardUpdateSuggestion[]> {
  const dir = path.join(systemRoot, 'corpus', 'anonymized');
  let entries: string[] = [];
  try { entries = await fs.readdir(dir); } catch { return []; }
  const reports: AnonymizedCorpusReport[] = [];
  for (const f of entries.filter((e) => e.endsWith('.json'))) {
    const r = await readJsonSafe<AnonymizedCorpusReport>(path.join(dir, f));
    if (r) reports.push(r);
  }
  if (reports.length === 0) return [];

  const out: StandardUpdateSuggestion[] = [];

  // 1. If docs_truth_missing > 0 across most projects of an archetype,
  // suggest raising docs_score weight for that standard.
  const byArch: Record<string, AnonymizedCorpusReport[]> = {};
  for (const r of reports) (byArch[r.archetype] ??= []).push(r);
  for (const [arch, rs] of Object.entries(byArch)) {
    const lying = rs.filter((r) => r.docs_truth_missing > 0);
    if (lying.length / rs.length >= 0.5 && rs.length >= 2) {
      out.push({
        id: shortId('sug'),
        standard_id: arch,
        reason: `${lying.length}/${rs.length} ${arch} projects ship docs claims (README) that don't resolve`,
        evidence_ids: lying.map((r) => r.project_id),
        proposed_change: `Raise docs_score weight by +2 and add docs:truth as a required quality gate`,
        risk_level: 'low',
        expected_impact: 'Projects of this archetype get penalized for unverified README claims, encouraging more truthful docs.',
        requires_manual_approval: false,
        status: 'pending',
        created_at: nowIso(),
      });
    }
  }

  // 2. If anti_gaming_findings > 0 in most of an archetype, propose
  // tightening that archetype's anti_gaming_rules.
  for (const [arch, rs] of Object.entries(byArch)) {
    const findings = rs.filter((r) => r.anti_gaming_findings > 0);
    if (findings.length / rs.length >= 0.4 && rs.length >= 2) {
      out.push({
        id: shortId('sug'),
        standard_id: arch,
        reason: `anti-gaming findings recur in ${findings.length}/${rs.length} ${arch} projects`,
        evidence_ids: findings.map((r) => r.project_id),
        proposed_change: 'Add explicit anti_gaming_rules to the standard; reduce test_score and build_score baseline if no_op_script / empty_test detected.',
        risk_level: 'medium',
        expected_impact: 'Score becomes harder to game in this archetype.',
        requires_manual_approval: true,
        status: 'pending',
        created_at: nowIso(),
      });
    }
  }

  await ensureDir(path.dirname(suggestionsPath(systemRoot)));
  await writeJson(suggestionsPath(systemRoot), out);
  return out;
}

export async function listSuggestions(systemRoot: string): Promise<StandardUpdateSuggestion[]> {
  return (await readJsonSafe<StandardUpdateSuggestion[]>(suggestionsPath(systemRoot))) ?? [];
}

export async function decideSuggestion(opts: {
  systemRoot: string;
  id: string;
  decision: 'approved' | 'rejected';
}): Promise<StandardUpdateSuggestion | null> {
  const all = await listSuggestions(opts.systemRoot);
  const idx = all.findIndex((s) => s.id === opts.id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx]!, status: opts.decision, decided_at: nowIso(), approver: process.env.USER ?? 'human' };
  await writeJson(suggestionsPath(opts.systemRoot), all);
  return all[idx]!;
}
