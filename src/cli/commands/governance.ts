import { readDecisions, findDecision } from '../../core/governanceDecisionLog.js';
import { flagString, requireProject } from './_shared.js';

export async function governanceLog(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const session = flagString(flags, 'session');
  if (!session) { process.stderr.write('error: --session required\n'); return 2; }
  const d = await readDecisions(project, session);
  process.stdout.write(JSON.stringify({ session, total: d.length, decisions: d }, null, 2) + '\n');
  return 0;
}

export async function governanceExplain(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const id = flagString(flags, 'decision');
  if (!id) { process.stderr.write('error: --decision required\n'); return 2; }
  const d = await findDecision(project, id);
  if (!d) { process.stderr.write('not found\n'); return 1; }
  process.stdout.write(JSON.stringify(d, null, 2) + '\n');
  return 0;
}
