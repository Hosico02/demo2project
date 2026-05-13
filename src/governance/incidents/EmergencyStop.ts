import path from 'node:path';
import { writeJson, readJsonSafe } from '../../utils/json.js';
import { ensureDir } from '../../utils/fs.js';
import { promises as fs } from 'node:fs';
import { nowIso, shortId } from '../../utils/time.js';
import { append as auditAppend } from '../audit/AuditLog.js';

export interface EmergencyStopState {
  active: boolean;
  triggered_at?: string;
  triggered_by?: string;
  reason?: string;
  related_incident?: string;
  resumed_at?: string;
  resume_reason?: string;
}

function stopFile(systemRoot: string): string {
  return path.join(systemRoot, '.demo2project', 'governance', 'emergency-stop.json');
}

export async function stop(systemRoot: string, by: string, reason: string, incidentId?: string): Promise<EmergencyStopState> {
  const rec: EmergencyStopState = {
    active: true,
    triggered_at: nowIso(),
    triggered_by: by,
    reason,
    related_incident: incidentId,
  };
  await ensureDir(path.dirname(stopFile(systemRoot)));
  await writeJson(stopFile(systemRoot), rec);
  await auditAppend(systemRoot, {
    actor: by,
    action: 'emergency:stop',
    target: 'system',
    decision: 'deny',
    risk_level: 'critical',
    incident_id: incidentId,
    metadata: { reason, event_id: shortId('estop') },
  });
  return rec;
}

export async function status(systemRoot: string): Promise<EmergencyStopState> {
  const r = await readJsonSafe<EmergencyStopState>(stopFile(systemRoot));
  return r ?? { active: false };
}

export async function resume(systemRoot: string, by: string, reason: string): Promise<EmergencyStopState> {
  const cur = await status(systemRoot);
  if (!cur.active) return cur;
  const next: EmergencyStopState = { ...cur, active: false, resumed_at: nowIso(), resume_reason: `${by}: ${reason}` };
  await writeJson(stopFile(systemRoot), next);
  await auditAppend(systemRoot, {
    actor: by,
    action: 'emergency:resume',
    target: 'system',
    decision: 'allow',
    risk_level: 'high',
    metadata: { reason },
  });
  return next;
}

void fs;
