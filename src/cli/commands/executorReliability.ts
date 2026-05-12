import { buildReliability, recommendExecutor, compareByArchetype } from '../../core/executorReliability.js';
import { flagString, requireProject } from './_shared.js';

export async function executorReliability(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const rows = await buildReliability(project);
  process.stdout.write(JSON.stringify({ rows, total: rows.length }, null, 2) + '\n');
  return 0;
}

export async function executorRecommend(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const r = await recommendExecutor({
    projectPath: project,
    taskCategory: flagString(flags, 'task'),
    archetype: flagString(flags, 'archetype'),
  });
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function executorCompare(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const arch = flagString(flags, 'archetype');
  if (!arch) { process.stderr.write('error: --archetype required\n'); return 2; }
  const r = await compareByArchetype(project, arch);
  process.stdout.write(JSON.stringify({ archetype: arch, rows: r }, null, 2) + '\n');
  return 0;
}
