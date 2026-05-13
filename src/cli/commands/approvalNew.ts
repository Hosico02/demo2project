import { ApprovalWorkflow } from '../../governance/approval/ApprovalWorkflow.js';
import { defaultSystemRoot, flagString } from './_shared.js';

export async function approvalList(): Promise<number> {
  const wf = new ApprovalWorkflow(defaultSystemRoot());
  const list = await wf.list();
  process.stdout.write(JSON.stringify({ total: list.length, approvals: list }, null, 2) + '\n');
  return 0;
}

export async function approvalShow(flags: Record<string, string | boolean>): Promise<number> {
  const id = flagString(flags, 'id');
  if (!id) { process.stderr.write('--id required\n'); return 2; }
  const wf = new ApprovalWorkflow(defaultSystemRoot());
  const r = await wf.get(id);
  if (!r) { process.stderr.write(`approval ${id} not found\n`); return 1; }
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function approvalApprove(flags: Record<string, string | boolean>): Promise<number> {
  const id = flagString(flags, 'id');
  if (!id) { process.stderr.write('--id required\n'); return 2; }
  const role = flagString(flags, 'role') ?? 'owner';
  const reason = flagString(flags, 'reason') ?? 'cli approved';
  const wf = new ApprovalWorkflow(defaultSystemRoot());
  try {
    const r = await wf.approve(id, role, reason);
    if (!r) { process.stderr.write(`approval ${id} not found\n`); return 1; }
    process.stdout.write(JSON.stringify(r, null, 2) + '\n');
    return 0;
  } catch (e) {
    process.stderr.write(`error: ${(e as Error).message}\n`); return 1;
  }
}

export async function approvalReject(flags: Record<string, string | boolean>): Promise<number> {
  const id = flagString(flags, 'id');
  if (!id) { process.stderr.write('--id required\n'); return 2; }
  const role = flagString(flags, 'role') ?? 'owner';
  const reason = flagString(flags, 'reason') ?? 'cli rejected';
  const wf = new ApprovalWorkflow(defaultSystemRoot());
  const r = await wf.reject(id, role, reason);
  if (!r) { process.stderr.write(`approval ${id} not found\n`); return 1; }
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function approvalRevoke(flags: Record<string, string | boolean>): Promise<number> {
  const id = flagString(flags, 'id');
  if (!id) { process.stderr.write('--id required\n'); return 2; }
  const role = flagString(flags, 'role') ?? 'owner';
  const reason = flagString(flags, 'reason') ?? 'cli revoked';
  const wf = new ApprovalWorkflow(defaultSystemRoot());
  const r = await wf.revoke(id, role, reason);
  if (!r) { process.stderr.write(`approval ${id} not found\n`); return 1; }
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}
