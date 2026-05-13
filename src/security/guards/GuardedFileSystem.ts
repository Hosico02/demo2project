import { promises as fs } from 'node:fs';
import { readTextSafe, writeText, ensureDir } from '../../utils/fs.js';
import { checkRead, checkWrite, checkDelete } from './FileAccessGuard.js';
import { append as auditAppend } from '../../governance/audit/AuditLog.js';
import path from 'node:path';

export interface GuardedFsOptions {
  systemRoot: string;
  projectPath: string;
  actor: string;
}

export async function read(target: string, opts: GuardedFsOptions): Promise<{ ok: boolean; data?: string | null; reason?: string }> {
  const g = checkRead(opts.projectPath, target);
  if (!g.allowed) {
    await auditAppend(opts.systemRoot, { actor: opts.actor, action: 'fs:read:blocked', target, decision: 'deny', risk_level: 'high', metadata: { reason: g.reason } });
    return { ok: false, reason: g.reason };
  }
  const data = await readTextSafe(target);
  return { ok: true, data };
}

export async function write(target: string, content: string, opts: GuardedFsOptions): Promise<{ ok: boolean; reason?: string }> {
  const g = checkWrite(opts.projectPath, target);
  if (!g.allowed) {
    await auditAppend(opts.systemRoot, { actor: opts.actor, action: 'fs:write:blocked', target, decision: 'deny', risk_level: 'high', metadata: { reason: g.reason } });
    return { ok: false, reason: g.reason };
  }
  await ensureDir(path.dirname(target));
  await writeText(target, content);
  await auditAppend(opts.systemRoot, { actor: opts.actor, action: 'fs:write', target, decision: 'allow', risk_level: 'low' });
  return { ok: true };
}

export async function remove(target: string, opts: GuardedFsOptions): Promise<{ ok: boolean; reason?: string }> {
  const g = checkDelete(opts.projectPath, target);
  if (!g.allowed) {
    await auditAppend(opts.systemRoot, { actor: opts.actor, action: 'fs:delete:blocked', target, decision: g.requires_approval ? 'require_approval' : 'deny', risk_level: 'high', metadata: { reason: g.reason } });
    return { ok: false, reason: g.reason };
  }
  await fs.unlink(target);
  return { ok: true };
}
