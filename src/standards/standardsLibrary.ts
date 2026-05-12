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
// In tests this is src/standards; in production it's dist/standards. We try
// both — package.json postbuild copies the json files into dist/, but if
// that ever fails the src location is a safe fallback.
const CANDIDATE_DIRS = [
  path.resolve(here, 'library'),
  path.resolve(here, '..', '..', 'src', 'standards', 'library'),
];

async function libraryDir(): Promise<string> {
  for (const d of CANDIDATE_DIRS) {
    try {
      await fs.access(d);
      return d;
    } catch { /* try next */ }
  }
  return CANDIDATE_DIRS[0]!;
}

export async function loadStandard(name: string): Promise<ProjectStandard | null> {
  const dir = await libraryDir();
  const p = path.join(dir, `${name}.standard.json`);
  const raw = await readJsonSafe<RawStandard>(p);
  return raw ? stripName(raw) : null;
}

export async function listStandards(): Promise<string[]> {
  try {
    const dir = await libraryDir();
    const entries = await fs.readdir(dir);
    return entries
      .filter((f) => f.endsWith('.standard.json'))
      .map((f) => f.replace('.standard.json', ''))
      .sort();
  } catch {
    return [];
  }
}

/**
 * Auto-select the most specific standard whose signals match this snapshot.
 * Order matters: specific → generic.
 */
export async function selectStandardForSnapshot(
  snapshot: ProjectSnapshot,
): Promise<{ standard: ProjectStandard; name: string }> {
  const fws = snapshot.detected_frameworks;
  const lang = snapshot.detected_language;
  const files = snapshot.important_files;
  const ordered: string[] = [];

  if (fws.includes('next')) ordered.push('nextjs-app');
  if (fws.includes('react')) ordered.push('react-app');
  if (fws.includes('fastapi') || files.some((f) => f.startsWith('app/main'))) ordered.push('fastapi-api');
  if (lang === 'python') ordered.push('python-package');
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
  // Should never happen — generic-project must exist — but be defensive.
  throw new Error('no standards available (generic-project missing)');
}

function stripName(raw: RawStandard): ProjectStandard {
  const { name: _n, ...rest } = raw;
  return rest as ProjectStandard;
}
