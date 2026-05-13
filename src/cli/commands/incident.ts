import { IncidentManager } from '../../governance/incidents/IncidentManager.js';
import { status, stop, resume } from '../../governance/incidents/EmergencyStop.js';
import { defaultSystemRoot, flagString } from './_shared.js';

export async function incidentList(): Promise<number> {
  const m = new IncidentManager(defaultSystemRoot());
  const list = await m.list();
  process.stdout.write(JSON.stringify({ total: list.length, incidents: list }, null, 2) + '\n');
  return 0;
}

export async function incidentShow(flags: Record<string, string | boolean>): Promise<number> {
  const id = flagString(flags, 'id');
  if (!id) { process.stderr.write('--id required\n'); return 2; }
  const m = new IncidentManager(defaultSystemRoot());
  const r = await m.get(id);
  if (!r) { process.stderr.write(`incident ${id} not found\n`); return 1; }
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function incidentResolve(flags: Record<string, string | boolean>): Promise<number> {
  const id = flagString(flags, 'id');
  if (!id) { process.stderr.write('--id required\n'); return 2; }
  const reason = flagString(flags, 'reason') ?? 'manual resolve';
  const m = new IncidentManager(defaultSystemRoot());
  const r = await m.resolve(id, reason);
  if (!r) { process.stderr.write(`incident ${id} not found\n`); return 1; }
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function emergencyStop(flags: Record<string, string | boolean>): Promise<number> {
  const reason = flagString(flags, 'reason') ?? 'manual stop';
  const r = await stop(defaultSystemRoot(), 'cli', reason);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function emergencyStatus(): Promise<number> {
  const r = await status(defaultSystemRoot());
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function emergencyResume(flags: Record<string, string | boolean>): Promise<number> {
  const reason = flagString(flags, 'reason') ?? 'manual resume';
  const r = await resume(defaultSystemRoot(), 'cli', reason);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}
