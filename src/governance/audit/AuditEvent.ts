import type { RiskLevel } from '../../security/policy/PolicySchema.js';

export interface AuditEventInput {
  actor: string;
  action: string;
  target: string;
  decision: string;
  risk_level: RiskLevel;
  policy_decision_id?: string;
  approval_id?: string;
  evidence_ids?: string[];
  incident_id?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditEvent extends AuditEventInput {
  id: string;
  timestamp: string;
  previous_hash: string;
  event_hash: string;
  evidence_ids: string[];
  metadata: Record<string, unknown>;
}
