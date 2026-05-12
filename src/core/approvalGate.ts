import path from 'node:path';
import { promises as fs } from 'node:fs';
import { ensureDir } from '../utils/fs.js';
import { writeJson, readJsonSafe } from '../utils/json.js';
import { stateDir } from '../utils/paths.js';
import { nowIso, shortId } from '../utils/time.js';

/**
 * Human approval gate (Phase 4).
 *
 * Classifies a list of changed files by risk and produces pending approvals
 * for medium / high risk paths. Persists at
 * `<project>/.demo2project/approvals/<id>.json`.
 *
 * The gate does NOT run inside the deterministic Supervisor loop by default
 * (that would break automation). Callers wrap risky writes with
 * `recordPendingApprovals(...)` and let humans run `approvals:approve`.
 */

export type RiskLevel = 'low' | 'medium' | 'high';

export interface ApprovalPolicy {
  auto_approve_low_risk: boolean;
  require_approval_medium_risk: boolean;
  block_high_risk_by_default: boolean;
  high_risk_paths: string[]; // glob-ish prefixes
  medium_risk_paths: string[];
}

export const DEFAULT_APPROVAL_POLICY: ApprovalPolicy = {
  auto_approve_low_risk: true,
  require_approval_medium_risk: true,
  block_high_risk_by_default: true,
  high_risk_paths: [
    'src/core/safety.ts',
    'src/core/redaction.ts',
    'qa/specs/',
    'config/approval-policy.json',
    '.github/workflows/',
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    'Dockerfile',
    'src/cli/commands/claudeInstallHooks.ts',
    'templates/claude/',
    'src/core/iterationWorkspace.ts',
    'src/agents/ExecutorAgent.ts',
  ],
  medium_risk_paths: [
    'src/agents/',
    'src/qa/',
    'src/core/evidenceWeightedScorer.ts',
    '.env',
    '.env.example',
    'migrations/',
  ],
};

export interface PendingApproval {
  id: string;
  iteration_id: string;
  created_at: string;
  status: 'pending' | 'approved' | 'rejected';
  risk: RiskLevel;
  reason: string;
  changed_files: string[];
  approver?: string;
  decided_at?: string;
  decision_note?: string;
}

export function classifyRisk(file: string, policy: ApprovalPolicy): RiskLevel {
  for (const p of policy.high_risk_paths) if (file === p || file.startsWith(p)) return 'high';
  for (const p of policy.medium_risk_paths) if (file === p || file.startsWith(p)) return 'medium';
  return 'low';
}

export async function loadPolicy(systemRoot: string): Promise<ApprovalPolicy> {
  const p = await readJsonSafe<ApprovalPolicy>(path.join(systemRoot, 'config', 'approval-policy.json'));
  return p ?? DEFAULT_APPROVAL_POLICY;
}

export async function recordPendingApprovals(
  projectPath: string,
  changedFiles: string[],
  iterationId: string,
  policy: ApprovalPolicy = DEFAULT_APPROVAL_POLICY,
): Promise<PendingApproval[]> {
  const groups: Record<RiskLevel, string[]> = { low: [], medium: [], high: [] };
  for (const f of changedFiles) groups[classifyRisk(f, policy)].push(f);
  const out: PendingApproval[] = [];
  const dir = path.join(stateDir(projectPath), 'approvals');
  await ensureDir(dir);
  for (const level of ['high', 'medium'] as RiskLevel[]) {
    if (groups[level].length === 0) continue;
    if (level === 'medium' && !policy.require_approval_medium_risk) continue;
    if (level === 'high' && !policy.block_high_risk_by_default) continue;
    const id = shortId('apv');
    const rec: PendingApproval = {
      id,
      iteration_id: iterationId,
      created_at: nowIso(),
      status: 'pending',
      risk: level,
      reason: `${groups[level].length} ${level}-risk path(s) changed`,
      changed_files: groups[level],
    };
    await writeJson(path.join(dir, `${id}.json`), rec);
    out.push(rec);
  }
  return out;
}

export async function listApprovals(projectPath: string): Promise<PendingApproval[]> {
  const dir = path.join(stateDir(projectPath), 'approvals');
  let entries: string[] = [];
  try { entries = await fs.readdir(dir); } catch { return []; }
  const out: PendingApproval[] = [];
  for (const f of entries.filter((e) => e.endsWith('.json'))) {
    const r = await readJsonSafe<PendingApproval>(path.join(dir, f));
    if (r) out.push(r);
  }
  return out;
}

export async function decideApproval(
  projectPath: string,
  id: string,
  decision: 'approved' | 'rejected',
  note?: string,
  approver?: string,
): Promise<PendingApproval | null> {
  const dir = path.join(stateDir(projectPath), 'approvals');
  const file = path.join(dir, `${id}.json`);
  const rec = await readJsonSafe<PendingApproval>(file);
  if (!rec) return null;
  rec.status = decision;
  rec.decided_at = nowIso();
  rec.decision_note = note;
  rec.approver = approver;
  await writeJson(file, rec);
  return rec;
}
