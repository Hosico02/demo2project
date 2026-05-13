import { readAll } from '../../governance/audit/AuditLog.js';
import { verify, findByEventId } from '../../governance/audit/AuditVerifier.js';
import { writeReport } from '../../governance/audit/AuditReporter.js';
import { defaultSystemRoot, flagString } from './_shared.js';

export async function auditShow(flags: Record<string, string | boolean>): Promise<number> {
  const limit = typeof flags.limit === 'string' ? Number(flags.limit) : 50;
  const events = await readAll(defaultSystemRoot());
  process.stdout.write(JSON.stringify({ total: events.length, events: events.slice(-limit) }, null, 2) + '\n');
  return 0;
}

export async function auditVerify(): Promise<number> {
  const r = await verify(defaultSystemRoot());
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return r.ok ? 0 : 1;
}

export async function auditReport(): Promise<number> {
  const r = await writeReport(defaultSystemRoot());
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function auditExplain(flags: Record<string, string | boolean>): Promise<number> {
  const id = flagString(flags, 'event');
  if (!id) { process.stderr.write('--event required\n'); return 2; }
  const e = await findByEventId(defaultSystemRoot(), id);
  if (!e) { process.stderr.write(`event ${id} not found\n`); return 1; }
  process.stdout.write(JSON.stringify(e, null, 2) + '\n');
  return 0;
}
