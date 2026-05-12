import path from 'node:path';
import { promises as fs } from 'node:fs';
import { writeJson, readJsonSafe } from '../utils/json.js';
import { ensureDir, appendText } from '../utils/fs.js';
import { stateDir } from '../utils/paths.js';
import { nowIso, shortId } from '../utils/time.js';

/**
 * GovernanceDecisionLog (Phase 6) — append-only audit log of every key
 * autonomous decision: continue, stop, rollback, request_approval, accept
 * patch, promote QA case, etc.
 *
 * Stored as JSONL at <project>/.demo2project/governance/<session>.jsonl
 * plus a JSON index for quick listing.
 */

export type DecisionType =
  | 'continue'
  | 'stop'
  | 'rollback'
  | 'request_approval'
  | 'accept_patch'
  | 'reject_patch'
  | 'promote_qa_case'
  | 'retire_qa_case'
  | 'update_standard'
  | 'switch_executor'
  | 'reduce_scope'
  | 'self_improve_accept'
  | 'self_improve_reject';

export interface GovernanceDecision {
  decision_id: string;
  session_id: string;
  iteration_id?: string;
  decision_type: DecisionType;
  options_considered: string[];
  selected_option: string;
  reason: string;
  risk_level: 'low' | 'medium' | 'high' | 'blocker';
  policy_reference?: string;
  evidence_ids: string[];
  approval_status?: 'pending' | 'approved' | 'rejected' | 'n/a';
  created_at: string;
}

function logFile(projectPath: string, sessionId: string): string {
  return path.join(stateDir(projectPath), 'governance', `${sessionId}.jsonl`);
}

export async function recordDecision(
  projectPath: string,
  input: Omit<GovernanceDecision, 'decision_id' | 'created_at'> & Partial<Pick<GovernanceDecision, 'decision_id' | 'created_at'>>,
): Promise<GovernanceDecision> {
  const d: GovernanceDecision = {
    decision_id: input.decision_id ?? shortId('dec'),
    created_at: input.created_at ?? nowIso(),
    session_id: input.session_id,
    iteration_id: input.iteration_id,
    decision_type: input.decision_type,
    options_considered: input.options_considered,
    selected_option: input.selected_option,
    reason: input.reason,
    risk_level: input.risk_level,
    policy_reference: input.policy_reference,
    evidence_ids: input.evidence_ids,
    approval_status: input.approval_status ?? 'n/a',
  };
  await appendText(logFile(projectPath, input.session_id), JSON.stringify(d) + '\n');
  return d;
}

export async function readDecisions(projectPath: string, sessionId: string): Promise<GovernanceDecision[]> {
  let txt: string | null = null;
  try { txt = await fs.readFile(logFile(projectPath, sessionId), 'utf8'); } catch { return []; }
  return txt
    .split('\n')
    .filter(Boolean)
    .map((line) => { try { return JSON.parse(line) as GovernanceDecision; } catch { return null; } })
    .filter((d): d is GovernanceDecision => d !== null);
}

export async function findDecision(projectPath: string, decisionId: string): Promise<GovernanceDecision | null> {
  const dir = path.join(stateDir(projectPath), 'governance');
  let entries: string[] = [];
  try { entries = await fs.readdir(dir); } catch { return null; }
  for (const f of entries.filter((e) => e.endsWith('.jsonl'))) {
    const decisions = await readDecisions(projectPath, f.replace('.jsonl', ''));
    const hit = decisions.find((d) => d.decision_id === decisionId);
    if (hit) return hit;
  }
  return null;
}

void writeJson; void readJsonSafe; void ensureDir; // re-export footprint kept light
