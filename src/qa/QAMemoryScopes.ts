import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import type { QACase, QAScope, ProjectSnapshot } from '../core/types.js';
import { readJsonSafe, writeJson } from '../utils/json.js';
import { dedupeCases } from './QADeduplicator.js';

/**
 * Three-tier QA memory:
 *
 *   1. repo  — <project>/.demo2project/qa/repo-cases.json
 *      One project's accumulated failures. Lowest portability, highest fidelity.
 *
 *   2. workspace — ~/.demo2project/qa/workspace-cases.json
 *      Patterns the user has seen across projects on this machine.
 *
 *   3. global — <systemRoot>/qa/specs/global-patterns.json
 *      Seeded "well-known" AI-coding failure modes that any project can
 *      benefit from at preflight (high portability).
 *
 * `preflightForSnapshot()` returns global → workspace → repo cases that are
 * relevant for the given snapshot (filtered by project_type when set).
 */

export function repoScopePath(projectPath: string): string {
  return path.join(projectPath, '.demo2project', 'qa', 'repo-cases.json');
}
export function workspaceScopePath(homeDir = os.homedir()): string {
  return path.join(homeDir, '.demo2project', 'qa', 'workspace-cases.json');
}
export function globalScopePath(systemRoot: string): string {
  return path.join(systemRoot, 'qa', 'specs', 'global-patterns.json');
}

async function load(p: string): Promise<QACase[]> {
  const v = await readJsonSafe<QACase[]>(p);
  return Array.isArray(v) ? v : [];
}

export interface ScopedLoad {
  global: QACase[];
  workspace: QACase[];
  repo: QACase[];
}

export interface ScopeOptions {
  projectPath: string;
  systemRoot: string;
  homeDir?: string;
}

export async function loadAllScopes(opts: ScopeOptions): Promise<ScopedLoad> {
  return {
    global: await load(globalScopePath(opts.systemRoot)),
    workspace: await load(workspaceScopePath(opts.homeDir)),
    repo: await load(repoScopePath(opts.projectPath)),
  };
}

export async function saveScoped(scope: QAScope, cases: QACase[], opts: ScopeOptions): Promise<string> {
  const p =
    scope === 'global'
      ? globalScopePath(opts.systemRoot)
      : scope === 'workspace'
        ? workspaceScopePath(opts.homeDir)
        : repoScopePath(opts.projectPath);
  await writeJson(p, cases);
  return p;
}

/** Upsert a single case into its scope, dedup by fingerprint. */
export async function upsertScoped(c: QACase, scope: QAScope, opts: ScopeOptions): Promise<QACase[]> {
  const existing = await load(
    scope === 'global'
      ? globalScopePath(opts.systemRoot)
      : scope === 'workspace'
        ? workspaceScopePath(opts.homeDir)
        : repoScopePath(opts.projectPath),
  );
  const merged = dedupeCases([...existing, { ...c, scope }]);
  await saveScoped(scope, merged, opts);
  return merged;
}

/**
 * Return cases relevant for this snapshot, ordered global → workspace → repo.
 * Filtering: case keeps if project_type is empty OR has 'generic' OR matches
 * any framework / language signal of the snapshot.
 */
export function selectForSnapshot(load: ScopedLoad, snapshot: ProjectSnapshot): QACase[] {
  const langs = [snapshot.detected_language, ...snapshot.detected_frameworks].map((s) => s.toLowerCase());
  const accept = (c: QACase): boolean => {
    if (!Array.isArray(c.project_type) || c.project_type.length === 0) return true;
    if (c.project_type.includes('generic')) return true;
    return c.project_type.some((p) => langs.includes(p.toLowerCase()));
  };
  return [...load.global.filter(accept), ...load.workspace.filter(accept), ...load.repo.filter(accept)];
}

/** Convenience helper for tests / CLI that doesn't need a systemRoot path. */
export function defaultSystemRootFromImportMeta(metaUrl: string): string {
  const here = path.dirname(fileURLToPath(metaUrl));
  return path.resolve(here, '..', '..');
}
