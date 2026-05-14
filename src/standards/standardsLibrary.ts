import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import type { ProjectSnapshot, ProjectStandard } from '../core/types.js';
import { readJsonSafe } from '../utils/json.js';

/**
 * Standards library: load and auto-select a ProjectStandard based on a
 * ProjectSnapshot. Falls back to generic-project when nothing matches.
 */

interface RawStandard extends ProjectStandard {
  name: string;
}

const here = path.dirname(fileURLToPath(import.meta.url));
// v0.0.5: the standards live in two folders — base/ and archetypes/ — with
// an optional learned/ overlay for workspace-level adjustments.
const CANDIDATE_ROOTS = [
  path.resolve(here),
  path.resolve(here, '..', '..', 'src', 'standards'),
];

async function findFile(name: string): Promise<string | null> {
  for (const root of CANDIDATE_ROOTS) {
    for (const sub of ['archetypes', 'base']) {
      const candidate = path.join(root, sub, `${name}.standard.json`);
      try { await fs.access(candidate); return candidate; } catch { /* next */ }
    }
  }
  return null;
}

async function findOverride(name: string): Promise<Partial<ProjectStandard> | null> {
  for (const root of CANDIDATE_ROOTS) {
    const file = path.join(root, 'learned', 'workspace-standard-overrides.json');
    const data = await readJsonSafe<Record<string, Partial<ProjectStandard>>>(file);
    if (data && data[name]) return data[name]!;
  }
  return null;
}

async function listAllRoots(): Promise<string[]> {
  const out: Set<string> = new Set();
  for (const root of CANDIDATE_ROOTS) {
    for (const sub of ['archetypes', 'base']) {
      try {
        const entries = await fs.readdir(path.join(root, sub));
        for (const e of entries) if (e.endsWith('.standard.json')) out.add(e.replace('.standard.json', ''));
      } catch { /* skip */ }
    }
  }
  return Array.from(out).sort();
}

export async function loadStandard(name: string): Promise<ProjectStandard | null> {
  const p = await findFile(name);
  if (!p) return null;
  const raw = await readJsonSafe<RawStandard>(p);
  if (!raw) return null;
  const base = stripName(raw);
  // apply workspace overrides if any
  const override = await findOverride(name);
  if (!override) return base;
  return { ...base, ...override } as ProjectStandard;
}

export async function selectStandardForProject(
  projectPath: string,
  snapshot: ProjectSnapshot,
): Promise<{ standard: ProjectStandard; name: string }> {
  const selected = await selectStandardForSnapshot(snapshot);
  const override = await readJsonSafe<Partial<ProjectStandard>>(
    path.join(projectPath, 'config', 'project-standard.json'),
  );
  if (!override) return selected;
  return {
    standard: mergeStandard(selected.standard, override),
    name: `${selected.name}+project-config`,
  };
}

export async function listStandards(): Promise<string[]> {
  return listAllRoots();
}

/**
 * Auto-select the most specific standard whose signals match this snapshot.
 * Order matters: specific → generic.
 */
export async function selectStandardForSnapshot(
  snapshot: ProjectSnapshot,
): Promise<{ standard: ProjectStandard; name: string }> {
  // v0.0.5: prefer the ProjectArchetypeDetector for fidelity, but keep this
  // function available so callers that already have a snapshot don't have to
  // re-run the full detector.
  const fws = snapshot.detected_frameworks;
  const lang = snapshot.detected_language;
  const files = snapshot.important_files;
  const ordered: string[] = [];

  // monorepo signal — strong, comes first
  if (files.includes('pnpm-workspace.yaml') || files.includes('turbo.json') || files.includes('nx.json') || files.includes('lerna.json')) {
    ordered.push('monorepo');
  }
  if (fws.includes('next')) ordered.push('nextjs-app');
  if (fws.includes('react')) ordered.push('react-app');
  if (fws.includes('vue')) ordered.push('vue-app');
  if (fws.includes('fastapi') || files.some((f) => f.startsWith('app/main'))) ordered.push('fastapi-api');
  if (fws.includes('flask')) ordered.push('flask-web-app');
  if (lang === 'python') {
    // python-cli vs python-package: prefer cli if entry-shape detected
    if (files.some((f) => /(^|\/)(app|main|cli)\.py$/.test(f))) ordered.push('python-cli');
    ordered.push('python-package');
  }
  if (lang === 'typescript' && (files.includes('tsconfig.json') || fws.includes('vitest') || fws.includes('jest'))) {
    ordered.push('typescript-library');
  }
  if (
    lang === 'typescript' ||
    lang === 'javascript' ||
    snapshot.start_commands.some((c) => /node\b/.test(c)) ||
    snapshot.package_manager !== 'unknown'
  ) {
    ordered.push('node-cli');
  }
  ordered.push('generic-project');

  for (const name of ordered) {
    const std = await loadStandard(name);
    if (std) return { standard: std, name };
  }
  throw new Error('no standards available (generic-project missing)');
}

function stripName(raw: RawStandard): ProjectStandard {
  const { name: _n, ...rest } = raw;
  return rest as ProjectStandard;
}

function mergeStandard(base: ProjectStandard, override: Partial<ProjectStandard>): ProjectStandard {
  return {
    ...base,
    ...override,
    verification_policy: {
      ...base.verification_policy,
      ...(override.verification_policy ?? {}),
    },
  };
}
