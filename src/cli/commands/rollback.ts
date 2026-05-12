import { IterationWorkspace } from '../../core/iterationWorkspace.js';
import { flagString, requireProject } from './_shared.js';

export async function rollback(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const iterationId = flagString(flags, 'iteration');
  if (!iterationId) {
    process.stderr.write('error: --iteration <id> is required\n');
    return 2;
  }
  const ws = new IterationWorkspace(project);
  const result = await ws.rollback(iterationId);
  process.stdout.write(JSON.stringify({ iteration_id: iterationId, ...result }, null, 2) + '\n');
  return result.ok ? 0 : 1;
}
