import path from 'node:path';
import { promises as fs } from 'node:fs';
import { ensureDir } from '../../utils/fs.js';
import { writeJson, readJsonSafe } from '../../utils/json.js';
import type { ApprovalRequest } from './ApprovalRequest.js';

function approvalsDir(systemRoot: string): string {
  return path.join(systemRoot, '.demo2project', 'governance', 'approvals');
}

export async function save(systemRoot: string, r: ApprovalRequest): Promise<string> {
  const dir = approvalsDir(systemRoot);
  await ensureDir(dir);
  const file = path.join(dir, `${r.id}.json`);
  await writeJson(file, r);
  return file;
}

export async function load(systemRoot: string, id: string): Promise<ApprovalRequest | null> {
  return readJsonSafe<ApprovalRequest>(path.join(approvalsDir(systemRoot), `${id}.json`));
}

export async function list(systemRoot: string): Promise<ApprovalRequest[]> {
  const dir = approvalsDir(systemRoot);
  let entries: string[] = [];
  try { entries = await fs.readdir(dir); } catch { return []; }
  const out: ApprovalRequest[] = [];
  for (const f of entries.filter((e) => e.endsWith('.json'))) {
    const r = await readJsonSafe<ApprovalRequest>(path.join(dir, f));
    if (r) out.push(r);
  }
  return out.sort((a, b) => a.requested_at.localeCompare(b.requested_at));
}
