import { listAvailableStandards, selectStandardForProject, validateAllStandards } from '../../standards/adaptiveStandardManager.js';
import { requireProject } from './_shared.js';

export async function standardsList(_flags: Record<string, string | boolean>): Promise<number> {
  const names = await listAvailableStandards();
  process.stdout.write(JSON.stringify({ total: names.length, standards: names }, null, 2) + '\n');
  return 0;
}

export async function standardsExplain(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const r = await selectStandardForProject(project);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function standardsValidate(_flags: Record<string, string | boolean>): Promise<number> {
  const r = await validateAllStandards();
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return r.ok ? 0 : 1;
}
