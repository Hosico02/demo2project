import { listApprovals, decideApproval } from '../../core/approvalGate.js';
import { flagString, requireProject } from './_shared.js';

export async function approvalsList(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const rows = await listApprovals(project);
  process.stdout.write(JSON.stringify({ total: rows.length, approvals: rows }, null, 2) + '\n');
  return 0;
}

export async function approvalsApprove(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const id = flagString(flags, 'id');
  if (!id) {
    process.stderr.write('error: --id required\n');
    return 2;
  }
  const r = await decideApproval(project, id, 'approved', flagString(flags, 'note'), process.env.USER ?? 'human');
  if (!r) { process.stderr.write('not found\n'); return 1; }
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function approvalsReject(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const id = flagString(flags, 'id');
  if (!id) {
    process.stderr.write('error: --id required\n');
    return 2;
  }
  const r = await decideApproval(project, id, 'rejected', flagString(flags, 'note'), process.env.USER ?? 'human');
  if (!r) { process.stderr.write('not found\n'); return 1; }
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}
