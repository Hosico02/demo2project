import { calibratePlanner, calibrationReport, explainCategory } from '../../core/plannerCalibration.js';
import { flagString, requireProject } from './_shared.js';

export async function plannerCalibrate(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const r = await calibratePlanner(project);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function plannerReport(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const r = await calibrationReport(project);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function plannerExplain(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const cat = flagString(flags, 'task-category');
  if (!cat) { process.stderr.write('error: --task-category required\n'); return 2; }
  const r = await explainCategory(project, cat);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}
