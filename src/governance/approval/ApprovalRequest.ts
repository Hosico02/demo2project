import { nowIso, shortId } from '../../utils/time.js';
import type { Capability } from '../../security/capabilities/CapabilityScope.js';
import type { RiskLevel } from '../../security/policy/PolicySchema.js';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'revoked';

export interface ApprovalRequest {
  id: string;
  action: string;
  actor: string;
  requested_capabilities: Capability[];
  risk_level: RiskLevel;
  reason: string;
  evidence_ids: string[];
  affected_files: string[];
  policy_decision_id?: string;
  status: ApprovalStatus;
  requested_at: string;
  expires_at: string;
  approved_by?: string;
  rejected_by?: string;
  decision_reason?: string;
  decided_at?: string;
  scope: {
    project_path?: string;
    path_prefixes?: string[];
    system_scope?: boolean;
  };
  max_uses: number;
  used_count: number;
}

export interface CreateApprovalRequestInput {
  action: string;
  actor: string;
  requested_capabilities: Capability[];
  risk_level: RiskLevel;
  reason: string;
  evidence_ids?: string[];
  affected_files?: string[];
  policy_decision_id?: string;
  expires_in_ms?: number;
  scope?: ApprovalRequest['scope'];
  max_uses?: number;
}

export function newRequest(input: CreateApprovalRequestInput): ApprovalRequest {
  const ttl = input.expires_in_ms ?? 30 * 60 * 1000;
  return {
    id: shortId('apr'),
    action: input.action,
    actor: input.actor,
    requested_capabilities: input.requested_capabilities,
    risk_level: input.risk_level,
    reason: input.reason,
    evidence_ids: input.evidence_ids ?? [],
    affected_files: input.affected_files ?? [],
    policy_decision_id: input.policy_decision_id,
    status: 'pending',
    requested_at: nowIso(),
    expires_at: new Date(Date.now() + ttl).toISOString(),
    scope: input.scope ?? {},
    max_uses: input.max_uses ?? 1,
    used_count: 0,
  };
}

export function isExpired(r: ApprovalRequest, refMs = Date.now()): boolean {
  return Date.parse(r.expires_at) <= refMs;
}
