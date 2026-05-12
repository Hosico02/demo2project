import path from 'node:path';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { writeJson, readJsonSafe } from '../utils/json.js';
import { ensureDir, listFiles, readTextSafe } from '../utils/fs.js';
import { stateDir } from '../utils/paths.js';
import { nowIso, shortId } from '../utils/time.js';
import { readJsonSafe as _ } from '../utils/json.js';
void _;

/**
 * ArchitectureDriftDetector (Phase 6).
 *
 * Captures a lightweight "architecture fingerprint" of a project — file
 * counts per directory, total LOC, dependency surface, doc/code ratio,
 * largest files — and compares two fingerprints to score drift.
 *
 * Pure heuristics. The detector emits FINDINGS, not actions. A caller
 * (controller) decides what to do.
 */

export interface ArchSnapshot {
  id: string;
  project_path_hash: string;
  taken_at: string;
  total_files: number;
  total_loc: number;
  files_by_top_dir: Record<string, number>;
  loc_by_top_dir: Record<string, number>;
  largest_files: { rel: string; lines: number }[];
  dependency_count: number;
  test_file_count: number;
  doc_file_count: number;
  source_file_count: number;
}

export interface ArchDriftFinding {
  detector: string;
  severity: 'low' | 'medium' | 'high' | 'blocker';
  message: string;
  delta?: number;
  related_paths?: string[];
}

export interface ArchitectureDriftReport {
  project_path_hash: string;
  baseline_snapshot: ArchSnapshot;
  current_snapshot: ArchSnapshot;
  drift_score: number;
  drift_findings: ArchDriftFinding[];
  dependency_growth: number;
  file_growth: number;
  loc_growth: number;
  module_boundary_findings: ArchDriftFinding[];
  duplicate_code_findings: ArchDriftFinding[];
  dead_code_findings: ArchDriftFinding[];
  recommended_actions: string[];
  risk_level: 'low' | 'medium' | 'high';
  evidence_ids: string[];
}

function hashPath(p: string): string {
  return createHash('sha256').update(path.resolve(p)).digest('hex').slice(0, 12);
}

function topDirOf(rel: string): string {
  const i = rel.indexOf('/');
  return i === -1 ? '(root)' : rel.slice(0, i);
}

export async function takeArchSnapshot(projectPath: string): Promise<ArchSnapshot> {
  const files = await listFiles(projectPath);
  const filesByDir: Record<string, number> = {};
  const locByDir: Record<string, number> = {};
  const largest: { rel: string; lines: number }[] = [];
  let totalLoc = 0;
  let testCount = 0, docCount = 0, sourceCount = 0;
  for (const f of files.slice(0, 1500)) {
    const dir = topDirOf(f);
    filesByDir[dir] = (filesByDir[dir] ?? 0) + 1;
    if (/\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt)$/.test(f)) {
      sourceCount++;
      const txt = await readTextSafe(path.join(projectPath, f));
      if (txt) {
        const lines = txt.split('\n').length;
        totalLoc += lines;
        locByDir[dir] = (locByDir[dir] ?? 0) + lines;
        largest.push({ rel: f, lines });
      }
    }
    if (/\.(test|spec)\./.test(f) || /(^|\/)tests?\//.test(f)) testCount++;
    if (/\.(md|mdx|rst|txt)$/.test(f) || /(^|\/)docs\//.test(f)) docCount++;
  }
  let depCount = 0;
  const pkg = await readJsonSafe<{ dependencies?: Record<string, string>; devDependencies?: Record<string, string> }>(path.join(projectPath, 'package.json'));
  if (pkg) depCount = Object.keys(pkg.dependencies ?? {}).length + Object.keys(pkg.devDependencies ?? {}).length;

  largest.sort((a, b) => b.lines - a.lines);
  return {
    id: shortId('arch'),
    project_path_hash: hashPath(projectPath),
    taken_at: nowIso(),
    total_files: files.length,
    total_loc: totalLoc,
    files_by_top_dir: filesByDir,
    loc_by_top_dir: locByDir,
    largest_files: largest.slice(0, 10),
    dependency_count: depCount,
    test_file_count: testCount,
    doc_file_count: docCount,
    source_file_count: sourceCount,
  };
}

async function readJsonSafeShim<T>(p: string): Promise<T | null> { return readJsonSafe<T>(p); }
void readJsonSafeShim;

function snapshotsDir(projectPath: string): string {
  return path.join(stateDir(projectPath), 'arch-snapshots');
}

export async function persistSnapshot(projectPath: string, s: ArchSnapshot): Promise<string> {
  const dir = snapshotsDir(projectPath);
  await ensureDir(dir);
  const p = path.join(dir, `${s.id}.json`);
  await writeJson(p, s);
  return p;
}

export async function loadSnapshot(projectPath: string, id: string): Promise<ArchSnapshot | null> {
  return readJsonSafe<ArchSnapshot>(path.join(snapshotsDir(projectPath), `${id}.json`));
}

export async function listSnapshots(projectPath: string): Promise<ArchSnapshot[]> {
  const dir = snapshotsDir(projectPath);
  let entries: string[] = [];
  try { entries = await fs.readdir(dir); } catch { return []; }
  const out: ArchSnapshot[] = [];
  for (const f of entries.filter((e) => e.endsWith('.json'))) {
    const r = await readJsonSafe<ArchSnapshot>(path.join(dir, f));
    if (r) out.push(r);
  }
  return out.sort((a, b) => a.taken_at.localeCompare(b.taken_at));
}

export function compareSnapshots(baseline: ArchSnapshot, current: ArchSnapshot): ArchitectureDriftReport {
  const findings: ArchDriftFinding[] = [];
  const moduleBoundary: ArchDriftFinding[] = [];
  const duplicateCode: ArchDriftFinding[] = [];
  const deadCode: ArchDriftFinding[] = [];

  const fileGrowth = current.total_files - baseline.total_files;
  const locGrowth = current.total_loc - baseline.total_loc;
  const depGrowth = current.dependency_count - baseline.dependency_count;

  if (fileGrowth > Math.max(20, baseline.total_files * 0.5)) {
    findings.push({
      detector: 'file_count_explosion',
      severity: 'high',
      message: `file count jumped ${baseline.total_files} → ${current.total_files} (+${fileGrowth})`,
      delta: fileGrowth,
    });
  }
  if (depGrowth >= 5) {
    findings.push({
      detector: 'dependency_bloat',
      severity: 'medium',
      message: `dependency count +${depGrowth}`,
      delta: depGrowth,
    });
  }
  for (const lf of current.largest_files) {
    if (lf.lines >= 800) {
      moduleBoundary.push({
        detector: 'oversized_file',
        severity: 'medium',
        message: `${lf.rel} has ${lf.lines} lines`,
        related_paths: [lf.rel],
      });
    }
  }
  // Doc/source imbalance check: docs growing way ahead of source is fine,
  // source growing without docs is suspect.
  if (current.source_file_count > baseline.source_file_count + 10 &&
      current.doc_file_count <= baseline.doc_file_count) {
    findings.push({
      detector: 'doc_code_imbalance',
      severity: 'medium',
      message: 'source grew without matching docs growth',
    });
  }
  // Test/source ratio check
  const testRatioBefore = baseline.test_file_count / Math.max(1, baseline.source_file_count);
  const testRatioAfter = current.test_file_count / Math.max(1, current.source_file_count);
  if (testRatioAfter < testRatioBefore - 0.1) {
    findings.push({
      detector: 'test_source_ratio_drop',
      severity: 'high',
      message: `test/source ratio dropped ${testRatioBefore.toFixed(2)} → ${testRatioAfter.toFixed(2)}`,
    });
  }
  // Module boundary heuristic: number of top-level dirs growing > +3
  const beforeDirs = Object.keys(baseline.files_by_top_dir).length;
  const afterDirs = Object.keys(current.files_by_top_dir).length;
  if (afterDirs > beforeDirs + 3) {
    moduleBoundary.push({
      detector: 'top_level_directory_sprawl',
      severity: 'medium',
      message: `${beforeDirs} → ${afterDirs} top-level dirs`,
    });
  }

  const driftScore =
    findings.length * 2 + moduleBoundary.length * 2 + duplicateCode.length + deadCode.length +
    (depGrowth > 0 ? Math.min(3, depGrowth / 2) : 0);

  const risk: 'low' | 'medium' | 'high' = driftScore >= 8 ? 'high' : driftScore >= 4 ? 'medium' : 'low';

  const recommended: string[] = [];
  if (findings.some((f) => f.detector === 'file_count_explosion')) recommended.push('audit new files for relevance; remove unused');
  if (findings.some((f) => f.detector === 'dependency_bloat')) recommended.push('audit new dependencies; remove unused');
  if (moduleBoundary.length > 0) recommended.push('split oversized files; consolidate top-level dirs');
  if (findings.some((f) => f.detector === 'test_source_ratio_drop')) recommended.push('add tests for newly added source');

  return {
    project_path_hash: current.project_path_hash,
    baseline_snapshot: baseline,
    current_snapshot: current,
    drift_score: Number(driftScore.toFixed(2)),
    drift_findings: findings,
    dependency_growth: depGrowth,
    file_growth: fileGrowth,
    loc_growth: locGrowth,
    module_boundary_findings: moduleBoundary,
    duplicate_code_findings: duplicateCode,
    dead_code_findings: deadCode,
    recommended_actions: recommended,
    risk_level: risk,
    evidence_ids: [],
  };
}
