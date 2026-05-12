import { createHandoff, showHandoff } from '../../core/humanHandoff.js';
import { flagString, requireProject } from './_shared.js';

export async function handoffCreate(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const session = flagString(flags, 'session');
  if (!session) { process.stderr.write('error: --session required\n'); return 2; }
  const r = await createHandoff({ projectPath: project, sessionId: session, reason: flagString(flags, 'reason') });
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function handoffShow(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const r = await showHandoff(project, flagString(flags, 'session'), flagString(flags, 'id'));
  if (!r) { process.stderr.write('no handoff report found\n'); return 1; }
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}
