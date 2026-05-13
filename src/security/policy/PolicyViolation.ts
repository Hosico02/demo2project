import path from 'node:path';
import { promises as fs } from 'node:fs';
import { ensureDir } from '../../utils/fs.js';
import { writeJson, readJsonSafe } from '../../utils/json.js';
import { stateDir } from '../../utils/paths.js';
import { nowIso, shortId } from '../../utils/time.js';
import type { PolicyDecision, PolicyRequest } from './PolicyEvaluator.js';
import type { RiskLevel } from './PolicySchema.js';

export interface PolicyViolation {
  id: string;
  request_id: string;
  violation_type: 'denied' | 'require_approval' | 'constraint_breach';
  severity: RiskLevel;
  message: string;
  actor: string;
  action: string;
  blocked: boolean;
  evidence_ids: string[];
  incident_id?: string;
  recorded_at: string;
}

export function fromDecision(req: PolicyRequest, decision: PolicyDecision): PolicyViolation | null {
  if (decision.decision === 'allow') return null;
  if (decision.decision === 'allow_with_constraints') return null;
  return {
    id: shortId('pv'),
    request_id: req.id,
    violation_type: decision.decision === 'deny' ? 'denied' : 'require_approval',
    severity: decision.risk_level,
    message: decision.reason,
    actor: req.actor,
    action: req.action,
    blocked: decision.decision === 'deny',
    evidence_ids: req.evidence_ids ?? [],
    recorded_at: nowIso(),
  };
}

export async function record(projectPath: string, v: PolicyViolation): Promise<string> {
  const dir = path.join(stateDir(projectPath), 'security', 'violations');
  await ensureDir(dir);
  const file = path.join(dir, `${v.id}.json`);
  await writeJson(file, v);
  return file;
}

export async function list(projectPath: string): Promise<PolicyViolation[]> {
  const dir = path.join(stateDir(projectPath), 'security', 'violations');
  let entries: string[] = [];
  try { entries = await fs.readdir(dir); } catch { return []; }
  const out: PolicyViolation[] = [];
  for (const f of entries.filter((e) => e.endsWith('.json'))) {
    const r = await readJsonSafe<PolicyViolation>(path.join(dir, f));
    if (r) out.push(r);
  }
  return out.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
}
