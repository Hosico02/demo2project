import path from 'node:path';
import type { IterationSummary } from './types.js';
import { iterationsDir } from '../utils/paths.js';
import { promises as fs } from 'node:fs';
import { readJsonSafe } from '../utils/json.js';
import { nowIso, shortId } from '../utils/time.js';

/**
 * RegressionBisector (Phase 6).
 *
 * Walks the iteration history (chronological), looks for the first
 * iteration where score decreased relative to the previous AND/OR a
 * verification command failed. Returns a structured RegressionRecord
 * with suspected files and a rollback recommendation.
 */

export interface RegressionRecord {
  id: string;
  session_id?: string;
  first_detected_iteration: string | null;
  suspected_introducing_iteration: string | null;
  affected_files: string[];
  failed_commands: string[];
  related_qa_cases: string[];
  severity: 'low' | 'medium' | 'high' | 'blocker';
  root_cause_hypothesis: string;
  rollback_recommendation: 'no_rollback' | 'rollback_to_previous_iteration' | 'rollback_to_first_clean';
  evidence_ids: string[];
}

async function loadAll(projectPath: string): Promise<IterationSummary[]> {
  const dir = iterationsDir(projectPath);
  let entries: string[] = [];
  try { entries = await fs.readdir(dir); } catch { return []; }
  const out: IterationSummary[] = [];
  for (const f of entries.filter((e) => e.endsWith('.json'))) {
    const s = await readJsonSafe<IterationSummary>(path.join(dir, f));
    if (s) out.push(s);
  }
  out.sort((a, b) => (a.started_at ?? '').localeCompare(b.started_at ?? ''));
  return out;
}

export async function bisect(projectPath: string, sessionId?: string): Promise<RegressionRecord> {
  const all = await loadAll(projectPath);
  const summaries = sessionId ? all : all; // session filtering would need explicit linking
  let suspected: IterationSummary | null = null;
  let firstDetected: IterationSummary | null = null;
  for (let i = 1; i < summaries.length; i++) {
    const prev = summaries[i - 1]!;
    const cur = summaries[i]!;
    const scoreDrop = cur.project_score_after.total < prev.project_score_after.total - 1;
    const failedHere = cur.verification_results.some((v) => !v.passed);
    if (scoreDrop || failedHere) {
      if (!firstDetected) firstDetected = cur;
      // pick the earliest with score drop
      if (scoreDrop && !suspected) suspected = cur;
    }
  }
  if (!firstDetected) {
    return {
      id: shortId('reg'),
      session_id: sessionId,
      first_detected_iteration: null,
      suspected_introducing_iteration: null,
      affected_files: [],
      failed_commands: [],
      related_qa_cases: [],
      severity: 'low',
      root_cause_hypothesis: 'no regression detected in recorded history',
      rollback_recommendation: 'no_rollback',
      evidence_ids: [],
    };
  }
  const suspected2 = suspected ?? firstDetected;
  return {
    id: shortId('reg'),
    session_id: sessionId,
    first_detected_iteration: firstDetected.iteration_id,
    suspected_introducing_iteration: suspected2.iteration_id,
    affected_files: suspected2.changed_files,
    failed_commands: suspected2.verification_results.filter((v) => !v.passed).map((v) => v.command),
    related_qa_cases: suspected2.qa_cases_created_or_updated,
    severity: suspected2.project_score_after.total < suspected2.project_score_before.total - 5 ? 'high' : 'medium',
    root_cause_hypothesis:
      `score dropped from ${suspected2.project_score_before.total} to ${suspected2.project_score_after.total} after touching ${suspected2.changed_files.length} file(s); ${suspected2.verification_results.filter((v) => !v.passed).length} verification failure(s)`,
    rollback_recommendation: 'rollback_to_previous_iteration',
    evidence_ids: [],
  };
}

export interface RollbackRecommendation {
  ok: boolean;
  reason: string;
  rollback_target_iteration?: string;
  timestamp: string;
}

export async function recommendRollback(projectPath: string, sessionId?: string): Promise<RollbackRecommendation> {
  const r = await bisect(projectPath, sessionId);
  if (r.rollback_recommendation === 'no_rollback') {
    return { ok: false, reason: 'no regression detected', timestamp: nowIso() };
  }
  const all = await loadAll(projectPath);
  const idx = all.findIndex((s) => s.iteration_id === r.suspected_introducing_iteration);
  if (idx <= 0) {
    return { ok: false, reason: 'no clean prior iteration to roll back to', timestamp: nowIso() };
  }
  const target = all[idx - 1]!.iteration_id;
  return { ok: true, reason: 'rollback to previous clean iteration', rollback_target_iteration: target, timestamp: nowIso() };
}
