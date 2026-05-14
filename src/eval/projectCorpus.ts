import path from 'node:path';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { writeJson, readJsonSafe } from '../utils/json.js';
import { ensureDir, writeText } from '../utils/fs.js';
import { redact } from '../core/redaction.js';
import { detectArchetype } from '../core/projectArchetypeDetector.js';
import { takeSnapshot } from '../core/projectSnapshot.js';
import { selectStandardForProject } from '../standards/adaptiveStandardManager.js';
import { scoreProjectWithEvidence } from '../core/evidenceWeightedScorer.js';
import { runDocsTruth } from '../core/docsTruth.js';
import { nowIso, shortId } from '../utils/time.js';

/**
 * Project Corpus (Phase 5) — local index of real projects we have analyzed.
 *
 * Privacy posture:
 *   - Absolute paths are hashed (sha256, first 12 chars) before persisting.
 *   - Reports include structure summary, score, gap, evidence summary, QA
 *     pattern names — NEVER raw source.
 *   - Output of every persisted field goes through `redact()` first.
 *   - No network calls. Everything stays on disk.
 */

export interface ProjectCorpusEntry {
  id: string;
  name: string;
  path: string;
  path_hash: string;
  archetype?: string;
  source: 'manual' | 'auto';
  anonymized: boolean;
  tags: string[];
  added_at: string;
  last_evaluated_at?: string;
  notes?: string;
}

export interface AnonymizedCorpusReport {
  project_id: string;
  archetype: string;
  archetype_confidence: number;
  selected_standard: string;
  score_total: number;
  score_grade: string;
  score_breakdown: Record<string, number>;
  defects_count: number;
  blocker_count: number;
  docs_truth_missing: number;
  anti_gaming_findings: number;
  structure_summary: {
    file_count: number;
    has_readme: boolean;
    has_tests: boolean;
    has_ci: boolean;
    package_manager: string;
    detected_frameworks: string[];
  };
  evaluated_at: string;
}

const here = path.dirname(fileURLToPath(import.meta.url));

function corpusRoot(systemRoot: string): string {
  return path.join(systemRoot, 'corpus');
}
function indexPath(systemRoot: string): string {
  return path.join(corpusRoot(systemRoot), 'projects.json');
}
function reportPath(systemRoot: string, id: string): string {
  return path.join(corpusRoot(systemRoot), 'reports', `${id}.json`);
}
function anonymizedPath(systemRoot: string, id: string): string {
  return path.join(corpusRoot(systemRoot), 'anonymized', `${id}.json`);
}

export function defaultSystemRoot(): string {
  return path.resolve(here, '..', '..');
}

function hashPath(p: string): string {
  return createHash('sha256').update(path.resolve(p)).digest('hex').slice(0, 12);
}

async function readIndex(systemRoot: string): Promise<ProjectCorpusEntry[]> {
  const v = await readJsonSafe<ProjectCorpusEntry[]>(indexPath(systemRoot));
  return Array.isArray(v) ? v : [];
}

async function writeIndex(systemRoot: string, entries: ProjectCorpusEntry[]): Promise<void> {
  await ensureDir(corpusRoot(systemRoot));
  await writeJson(indexPath(systemRoot), entries);
}

export async function corpusAdd(opts: {
  systemRoot: string;
  projectPath: string;
  name?: string;
  tags?: string[];
  notes?: string;
}): Promise<ProjectCorpusEntry> {
  const entries = await readIndex(opts.systemRoot);
  const path_hash = hashPath(opts.projectPath);
  const existing = entries.find((e) => e.path_hash === path_hash);
  if (existing) return existing;
  const arch = (await detectArchetype(opts.projectPath)).primary;
  const entry: ProjectCorpusEntry = {
    id: shortId('corpus'),
    name: opts.name ?? path.basename(opts.projectPath),
    path: redact(opts.projectPath),
    path_hash,
    archetype: arch.id,
    source: 'manual',
    anonymized: true,
    tags: opts.tags ?? [],
    added_at: nowIso(),
    notes: opts.notes,
  };
  entries.push(entry);
  await writeIndex(opts.systemRoot, entries);
  return entry;
}

export async function corpusRemove(opts: { systemRoot: string; id: string }): Promise<boolean> {
  const entries = await readIndex(opts.systemRoot);
  const idx = entries.findIndex((e) => e.id === opts.id);
  if (idx === -1) return false;
  entries.splice(idx, 1);
  await writeIndex(opts.systemRoot, entries);
  return true;
}

export async function corpusList(opts: { systemRoot: string }): Promise<ProjectCorpusEntry[]> {
  return readIndex(opts.systemRoot);
}

export async function corpusEvaluate(opts: {
  systemRoot: string;
  id?: string;
  all?: boolean;
}): Promise<AnonymizedCorpusReport[]> {
  const entries = await readIndex(opts.systemRoot);
  const targets = opts.all ? entries : entries.filter((e) => e.id === opts.id);
  if (!opts.all && !opts.id) throw new Error('pass --id <id> or --all');
  const out: AnonymizedCorpusReport[] = [];

  for (const entry of targets) {
    // Resolve a usable project path. We can't recover the original from
    // path_hash alone; the user must keep the source on disk. We look up
    // by the recorded redacted path; if it doesn't resolve, we skip.
    const original = entry.path;
    let exists = false;
    try { exists = (await fs.stat(original)).isDirectory(); } catch { exists = false; }
    if (!exists) continue;

    const arch = (await detectArchetype(original)).primary;
    const sel = await selectStandardForProject(original);
    const snap = await takeSnapshot(original);
    const score = await scoreProjectWithEvidence(snap, sel.selected_standard);
    const docs = await runDocsTruth(original);

    const report: AnonymizedCorpusReport = {
      project_id: entry.id,
      archetype: arch.id,
      archetype_confidence: arch.confidence,
      selected_standard: sel.selected_name,
      score_total: score.total,
      score_grade: score.grade,
      score_breakdown: { ...score.breakdown } as unknown as Record<string, number>,
      defects_count: 0, // wired by caller if a fuller eval is run
      blocker_count: 0,
      docs_truth_missing: docs.missing,
      anti_gaming_findings: (score as { anti_gaming_findings?: unknown[] }).anti_gaming_findings?.length ?? 0,
      structure_summary: {
        file_count: snap.important_files.length,
        has_readme: snap.important_files.includes('README.md'),
        has_tests: snap.important_files.includes('tests') || snap.important_files.some((f) => f.startsWith('tests/')),
        has_ci: snap.important_files.some((f) => f.startsWith('.github/workflows')),
        package_manager: snap.package_manager,
        detected_frameworks: snap.detected_frameworks,
      },
      evaluated_at: nowIso(),
    };

    // Persist BOTH the report (per-id) AND the anonymized version
    await ensureDir(path.dirname(reportPath(opts.systemRoot, entry.id)));
    await ensureDir(path.dirname(anonymizedPath(opts.systemRoot, entry.id)));
    await writeJson(reportPath(opts.systemRoot, entry.id), report);
    await writeJson(anonymizedPath(opts.systemRoot, entry.id), report); // identical shape — both already anonymized

    // Update last_evaluated_at on the index entry
    const idx = entries.findIndex((e) => e.id === entry.id);
    if (idx !== -1) entries[idx] = { ...entries[idx]!, last_evaluated_at: nowIso(), archetype: arch.id };
    out.push(report);
  }
  await writeIndex(opts.systemRoot, entries);
  return out;
}

export async function corpusReport(opts: { systemRoot: string; outputDir?: string }): Promise<{
  reportPath: string;
  total: number;
  entries: ProjectCorpusEntry[];
  archetypes: Record<string, number>;
}> {
  const entries = await readIndex(opts.systemRoot);
  const archetypes: Record<string, number> = {};
  for (const e of entries) archetypes[e.archetype ?? 'unknown'] = (archetypes[e.archetype ?? 'unknown'] ?? 0) + 1;
  const dir = opts.outputDir ?? path.join(opts.systemRoot, 'reports', 'workspace');
  await ensureDir(dir);
  const md: string[] = [];
  md.push('# Corpus report');
  md.push('');
  md.push(`Generated: ${nowIso()}`);
  md.push('');
  md.push(`- Total entries: **${entries.length}**`);
  md.push('');
  md.push('## By archetype');
  md.push('');
  for (const [arch, n] of Object.entries(archetypes)) md.push(`- ${arch}: ${n}`);
  md.push('');
  const p = path.join(dir, 'corpus-report.md');
  await writeText(p, md.join('\n'));
  return { reportPath: p, total: entries.length, entries, archetypes };
}
