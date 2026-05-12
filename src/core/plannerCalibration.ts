import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { IterationSummary } from './types.js';
import { iterationsDir } from '../utils/paths.js';
import { readJsonSafe, writeJson } from '../utils/json.js';
import { ensureDir } from '../utils/fs.js';
import { stateDir } from '../utils/paths.js';
import { nowIso } from '../utils/time.js';

/**
 * PlannerCalibrationEngine (Phase 6) — measures how accurate the
 * IterationPlanner is by comparing each task's predicted score delta
 * against the actual delta after that iteration.
 *
 * Output is queryable per archetype / task category so future Planner
 * versions can self-correct.
 */

export interface PlannerCalibrationRecord {
  task_id: string;
  iteration_id: string;
  archetype?: string;
  task_category: string; // task.title-derived
  predicted_score_delta: number;
  actual_score_delta: number;
  prediction_error: number;
  predicted_risk: string;
  actual_risk: string;
  risk_error: number; // mapped to numeric distance
  outcome: 'completed' | 'failed' | 'skipped' | 'unknown';
  lesson?: string;
  evidence_ids: string[];
}

const RISK_ORDER: Record<string, number> = { info: 0, low: 1, medium: 2, high: 3, blocker: 4 };

function calibPath(projectPath: string): string {
  return path.join(stateDir(projectPath), 'planner', 'calibration.json');
}

async function loadAll(projectPath: string): Promise<PlannerCalibrationRecord[]> {
  return (await readJsonSafe<PlannerCalibrationRecord[]>(calibPath(projectPath))) ?? [];
}

async function loadIterationSummaries(projectPath: string): Promise<IterationSummary[]> {
  const dir = iterationsDir(projectPath);
  let entries: string[] = [];
  try { entries = await fs.readdir(dir); } catch { return []; }
  const out: IterationSummary[] = [];
  for (const f of entries.filter((e) => e.endsWith('.json'))) {
    const s = await readJsonSafe<IterationSummary>(path.join(dir, f));
    if (s) out.push(s);
  }
  return out;
}

function classifyCategory(title: string): string {
  const t = title.toLowerCase();
  if (/readme/.test(t)) return 'docs/readme';
  if (/test/.test(t)) return 'test/setup';
  if (/build|tsconfig/.test(t)) return 'build/config';
  if (/env/.test(t)) return 'config/env';
  if (/ci/.test(t)) return 'ci/workflow';
  if (/gitignore/.test(t)) return 'repo/gitignore';
  if (/docker/.test(t)) return 'runtime/docker';
  return 'other';
}

export async function calibratePlanner(projectPath: string): Promise<{ added: number; total: number }> {
  const summaries = await loadIterationSummaries(projectPath);
  const existing = await loadAll(projectPath);
  const seen = new Set(existing.map((r) => r.task_id));
  const out = [...existing];
  for (const s of summaries) {
    const actualTotalDelta = s.project_score_after.total - s.project_score_before.total;
    // Distribute total delta evenly across tasks (no per-task ground truth).
    const taskCount = Math.max(1, s.assigned_tasks.length);
    const perTaskActual = actualTotalDelta / taskCount;
    for (const task of s.assigned_tasks) {
      if (seen.has(task.id)) continue;
      const r = s.executor_results.find((x) => x.task_id === task.id);
      const outcome = (r?.status ?? 'unknown') as PlannerCalibrationRecord['outcome'];
      const actualRisk: string = outcome === 'failed' ? 'high' : outcome === 'skipped' ? 'low' : task.priority;
      const predictedDelta = s.iteration_plan.expected_score_delta / taskCount;
      const record: PlannerCalibrationRecord = {
        task_id: task.id,
        iteration_id: s.iteration_id,
        task_category: classifyCategory(task.title),
        predicted_score_delta: Number(predictedDelta.toFixed(2)),
        actual_score_delta: Number(perTaskActual.toFixed(2)),
        prediction_error: Number((perTaskActual - predictedDelta).toFixed(2)),
        predicted_risk: task.priority,
        actual_risk: String(actualRisk),
        risk_error: (RISK_ORDER[String(actualRisk)] ?? 1) - (RISK_ORDER[task.priority] ?? 1),
        outcome,
        evidence_ids: [],
      };
      out.push(record);
    }
  }
  await ensureDir(path.dirname(calibPath(projectPath)));
  await writeJson(calibPath(projectPath), out);
  return { added: out.length - existing.length, total: out.length };
}

export async function calibrationReport(projectPath: string): Promise<{
  total: number;
  by_category: Record<string, { count: number; mean_prediction_error: number; mean_risk_error: number; failed: number }>;
  worst_predictions: PlannerCalibrationRecord[];
  generated_at: string;
}> {
  const records = await loadAll(projectPath);
  const byCat: Record<string, { count: number; mean_prediction_error: number; mean_risk_error: number; failed: number }> = {};
  for (const r of records) {
    const b = (byCat[r.task_category] ??= { count: 0, mean_prediction_error: 0, mean_risk_error: 0, failed: 0 });
    b.count++;
    b.mean_prediction_error += r.prediction_error;
    b.mean_risk_error += r.risk_error;
    if (r.outcome === 'failed') b.failed++;
  }
  for (const k of Object.keys(byCat)) {
    byCat[k]!.mean_prediction_error = Number((byCat[k]!.mean_prediction_error / byCat[k]!.count).toFixed(2));
    byCat[k]!.mean_risk_error = Number((byCat[k]!.mean_risk_error / byCat[k]!.count).toFixed(2));
  }
  const worst = records.slice().sort((a, b) => Math.abs(b.prediction_error) - Math.abs(a.prediction_error)).slice(0, 5);
  return { total: records.length, by_category: byCat, worst_predictions: worst, generated_at: nowIso() };
}

export async function explainCategory(projectPath: string, category: string): Promise<{
  category: string;
  records: PlannerCalibrationRecord[];
  mean_error: number;
}> {
  const all = await loadAll(projectPath);
  const filtered = all.filter((r) => r.task_category === category);
  const mean = filtered.length === 0 ? 0 : filtered.reduce((a, r) => a + r.prediction_error, 0) / filtered.length;
  return { category, records: filtered, mean_error: Number(mean.toFixed(2)) };
}
