import { takeArchSnapshot, persistSnapshot, loadSnapshot, listSnapshots, compareSnapshots } from '../../core/architectureDrift.js';
import { flagString, requireProject } from './_shared.js';

export async function driftCheck(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const snap = await takeArchSnapshot(project);
  await persistSnapshot(project, snap);
  const history = await listSnapshots(project);
  if (history.length < 2) {
    process.stdout.write(JSON.stringify({ snapshot_id: snap.id, message: 'no baseline yet — saved current as baseline' }, null, 2) + '\n');
    return 0;
  }
  const baseline = history[0]!;
  const report = compareSnapshots(baseline, snap);
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  return 0;
}

export async function driftCompare(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const beforeId = flagString(flags, 'before');
  const afterId = flagString(flags, 'after');
  if (!beforeId || !afterId) { process.stderr.write('error: --before and --after snapshot ids required\n'); return 2; }
  const a = await loadSnapshot(project, beforeId);
  const b = await loadSnapshot(project, afterId);
  if (!a || !b) { process.stderr.write('error: snapshot id(s) not found\n'); return 1; }
  process.stdout.write(JSON.stringify(compareSnapshots(a, b), null, 2) + '\n');
  return 0;
}
