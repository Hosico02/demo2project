import { createReplayBundle, runReplay, explainBundle, listBundles } from '../../core/replaySystem.js';
import { flagString, requireProject } from './_shared.js';

export async function replayCreate(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const session = flagString(flags, 'session');
  if (!session) { process.stderr.write('error: --session required\n'); return 2; }
  const b = await createReplayBundle(project, session);
  process.stdout.write(JSON.stringify(b, null, 2) + '\n');
  return 0;
}

export async function replayRun(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const id = flagString(flags, 'bundle');
  if (!id) { process.stderr.write('error: --bundle required\n'); return 2; }
  const r = await runReplay(project, id);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function replayExplain(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const id = flagString(flags, 'bundle');
  if (id) {
    const r = await explainBundle(project, id);
    process.stdout.write(JSON.stringify(r, null, 2) + '\n');
    return 0;
  }
  const list = await listBundles(project);
  process.stdout.write(JSON.stringify({ total: list.length, bundles: list }, null, 2) + '\n');
  return 0;
}
