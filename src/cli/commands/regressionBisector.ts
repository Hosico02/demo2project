import path from 'node:path';
import { bisect, recommendRollback } from '../../core/regressionBisector.js';
import { writeJson } from '../../utils/json.js';
import { ensureDir } from '../../utils/fs.js';
import { flagString, requireProject } from './_shared.js';

export async function regressionBisect(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const r = await bisect(project, flagString(flags, 'session'));
  // Persist for `regression:explain --regression <id>`
  const dir = path.join(project, '.demo2project', 'regressions');
  await ensureDir(dir);
  await writeJson(path.join(dir, `${r.id}.json`), r);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function regressionExplain(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const id = flagString(flags, 'regression');
  if (!id) { process.stderr.write('error: --regression required\n'); return 2; }
  const fp = path.join(project, '.demo2project', 'regressions', `${id}.json`);
  const { readJsonSafe } = await import('../../utils/json.js');
  const r = await readJsonSafe(fp);
  if (!r) { process.stderr.write('not found\n'); return 1; }
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function rollbackStable(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const r = await recommendRollback(project, flagString(flags, 'session'));
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return r.ok ? 0 : 1;
}
