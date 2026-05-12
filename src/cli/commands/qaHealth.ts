import { reportMemoryHealth, compactMemory, mergeCases, retireStale } from '../../qa/QAMemoryHealth.js';
import { flagString, requireProject } from './_shared.js';

export async function qaHealth(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const r = await reportMemoryHealth(project);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function qaCompact(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const apply = flags.apply === true || flags.apply === 'true';
  const r = await compactMemory(project, { applyRetire: apply, applyMerge: apply });
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function qaMerge(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const a = flagString(flags, 'case-a');
  const b = flagString(flags, 'case-b');
  if (!a || !b) { process.stderr.write('error: --case-a and --case-b required\n'); return 2; }
  const r = await mergeCases(project, a, b);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return r.ok ? 0 : 1;
}

export async function qaRetireStale(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const r = await retireStale(project);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function qaReportMemory(flags: Record<string, string | boolean>): Promise<number> {
  return qaHealth(flags); // alias
}
