import path from 'node:path';
import { takeSnapshot } from '../core/projectSnapshot.js';
import { detectArchetype } from '../core/projectArchetypeDetector.js';
import type { ProjectSnapshot } from '../core/types.js';
import type { AnonymizedCorpusReport } from './projectCorpus.js';
import { promises as fs } from 'node:fs';
import { readJsonSafe } from '../utils/json.js';

/**
 * ProjectSimilarityEngine (Phase 5).
 *
 * Deterministic Jaccard over normalized signal tokens. No embeddings, no
 * external API. Intentionally simple — the goal is "find historical
 * projects worth consulting", not perfect ranking.
 */

export interface SimilarityHit {
  project_id: string;
  similarity_score: number;
  shared_signals: string[];
  differing_signals: string[];
  archetype: string;
}

function tokensFromSnapshot(s: ProjectSnapshot): Set<string> {
  return new Set([
    `lang:${s.detected_language}`,
    `pm:${s.package_manager}`,
    ...s.detected_frameworks.map((f) => `fw:${f}`),
    ...s.test_commands.map((c) => `tc:${c.split(' ')[0]}`),
    ...s.build_commands.map((c) => `bc:${c.split(' ')[0]}`),
    ...s.important_files.slice(0, 30).map((f) => `f:${f}`),
  ]);
}

function tokensFromReport(r: AnonymizedCorpusReport): Set<string> {
  return new Set([
    `lang:${r.structure_summary.package_manager === 'pnpm' || r.structure_summary.package_manager === 'npm' || r.structure_summary.package_manager === 'yarn' || r.structure_summary.package_manager === 'bun' ? 'typescript-or-javascript' : 'unknown'}`,
    `pm:${r.structure_summary.package_manager}`,
    `arch:${r.archetype}`,
    `std:${r.selected_standard}`,
    ...r.structure_summary.detected_frameworks.map((f) => `fw:${f}`),
    r.structure_summary.has_tests ? 'has:tests' : 'no:tests',
    r.structure_summary.has_ci ? 'has:ci' : 'no:ci',
    r.structure_summary.has_readme ? 'has:readme' : 'no:readme',
  ]);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export async function similarProjects(opts: {
  systemRoot: string;
  projectPath: string;
  topK?: number;
  threshold?: number;
}): Promise<SimilarityHit[]> {
  const k = opts.topK ?? 5;
  const threshold = opts.threshold ?? 0.15;
  const snap = await takeSnapshot(opts.projectPath);
  const arch = (await detectArchetype(opts.projectPath)).primary;
  const target = new Set([...tokensFromSnapshot(snap), `arch:${arch.id}`]);

  const dir = path.join(opts.systemRoot, 'corpus', 'anonymized');
  let entries: string[] = [];
  try { entries = await fs.readdir(dir); } catch { return []; }

  const hits: SimilarityHit[] = [];
  for (const f of entries.filter((e) => e.endsWith('.json'))) {
    const r = await readJsonSafe<AnonymizedCorpusReport>(path.join(dir, f));
    if (!r) continue;
    const other = tokensFromReport(r);
    const score = jaccard(target, other);
    if (score < threshold) continue;
    const shared = Array.from(target).filter((t) => other.has(t));
    const diff = Array.from(target).filter((t) => !other.has(t));
    hits.push({
      project_id: r.project_id,
      similarity_score: Number(score.toFixed(3)),
      shared_signals: shared,
      differing_signals: diff,
      archetype: r.archetype,
    });
  }
  return hits.sort((a, b) => b.similarity_score - a.similarity_score).slice(0, k);
}
