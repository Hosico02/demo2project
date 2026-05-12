import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { IterationSummary } from './types.js';
import { iterationsDir } from '../utils/paths.js';
import { readJsonSafe } from '../utils/json.js';
import { nowIso } from '../utils/time.js';

/**
 * ExecutorReliabilityModel (Phase 6) — derives per-provider, per-task-category
 * reliability from recorded iteration summaries.
 *
 * Pure aggregation. Recommends executors by reliability for a given task
 * category + archetype.
 */

export interface ReliabilityRow {
  provider_name: string;
  task_category: string;
  archetype: string;
  success_count: number;
  failure_count: number;
  total: number;
  success_rate: number;
  verification_pass_rate: number;
  regression_rate: number;
  unverified_claim_rate: number;
  output_parse_failure_rate: number;
  average_cost_ms: number;
  confidence_score: number; // [0..1]
}

function classify(title: string): string {
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

export async function buildReliability(projectPath: string): Promise<ReliabilityRow[]> {
  const dir = iterationsDir(projectPath);
  let entries: string[] = [];
  try { entries = await fs.readdir(dir); } catch { return []; }
  const summaries: IterationSummary[] = [];
  for (const f of entries.filter((e) => e.endsWith('.json'))) {
    const s = await readJsonSafe<IterationSummary>(path.join(dir, f));
    if (s) summaries.push(s);
  }

  const acc: Record<string, ReliabilityRow> = {};
  for (const s of summaries) {
    for (const result of s.executor_results) {
      const task = s.assigned_tasks.find((t) => t.id === result.task_id);
      if (!task) continue;
      const provider = (result as { agent?: string }).agent ?? 'unknown';
      const cat = classify(task.title);
      const arch = (s.project_snapshot as { detected_language?: string }).detected_language ?? 'unknown';
      const key = `${provider}|${cat}|${arch}`;
      const row = (acc[key] ??= {
        provider_name: provider,
        task_category: cat,
        archetype: arch,
        success_count: 0,
        failure_count: 0,
        total: 0,
        success_rate: 0,
        verification_pass_rate: 0,
        regression_rate: 0,
        unverified_claim_rate: 0,
        output_parse_failure_rate: 0,
        average_cost_ms: 0,
        confidence_score: 0,
      });
      row.total++;
      if (result.status === 'completed') row.success_count++;
      else if (result.status === 'failed') row.failure_count++;
      const verPassed = result.verification_evidence.every((e) => e.passed);
      if (verPassed && result.verification_evidence.length > 0) row.verification_pass_rate++;
      if (result.changed_files.length > 0 && result.verification_evidence.length === 0 && !result.unable_to_verify_reason) {
        row.unverified_claim_rate++;
      }
      const totalMs = result.verification_evidence.reduce((a, e) => a + e.duration_ms, 0);
      row.average_cost_ms += totalMs;
    }
  }
  for (const row of Object.values(acc)) {
    if (row.total === 0) continue;
    row.success_rate = Number((row.success_count / row.total).toFixed(3));
    row.verification_pass_rate = Number((row.verification_pass_rate / row.total).toFixed(3));
    row.unverified_claim_rate = Number((row.unverified_claim_rate / row.total).toFixed(3));
    row.average_cost_ms = Math.round(row.average_cost_ms / row.total);
    row.regression_rate = Number((row.failure_count / row.total).toFixed(3));
    row.output_parse_failure_rate = 0;
    row.confidence_score = Number((row.success_rate * 0.6 + row.verification_pass_rate * 0.3 + (1 - row.unverified_claim_rate) * 0.1).toFixed(3));
  }
  return Object.values(acc);
}

export interface RecommendInput {
  projectPath: string;
  taskCategory?: string;
  archetype?: string;
}

export interface RecommendOutput {
  recommended_provider: string;
  candidates: ReliabilityRow[];
  reasoning: string;
  generated_at: string;
}

export async function recommendExecutor(opts: RecommendInput): Promise<RecommendOutput> {
  const rows = await buildReliability(opts.projectPath);
  let filtered = rows;
  if (opts.taskCategory) filtered = filtered.filter((r) => r.task_category === opts.taskCategory);
  if (opts.archetype) filtered = filtered.filter((r) => r.archetype === opts.archetype || r.archetype === 'unknown');
  filtered.sort((a, b) => b.confidence_score - a.confidence_score);
  const top = filtered[0];
  return {
    recommended_provider: top?.provider_name ?? 'rule-based',
    candidates: filtered,
    reasoning: top
      ? `${top.provider_name} has confidence ${top.confidence_score} for ${top.task_category}/${top.archetype}`
      : 'no historical data; defaulting to rule-based',
    generated_at: nowIso(),
  };
}

export async function compareByArchetype(projectPath: string, archetype: string): Promise<ReliabilityRow[]> {
  const rows = await buildReliability(projectPath);
  return rows.filter((r) => r.archetype === archetype).sort((a, b) => b.confidence_score - a.confidence_score);
}
