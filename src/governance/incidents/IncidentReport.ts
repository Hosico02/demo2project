import type { RiskLevel } from '../../security/policy/PolicySchema.js';

export type IncidentType =
  | 'secret_exposure'
  | 'unsafe_command_attempt'
  | 'prompt_injection_detected'
  | 'malicious_repo_detected'
  | 'policy_violation'
  | 'approval_bypass_attempt'
  | 'audit_log_tampering'
  | 'self_modification_violation'
  | 'network_exfiltration_attempt'
  | 'supply_chain_risk'
  | 'qa_memory_poisoning'
  | 'rollback_failure';

export type IncidentStatus = 'open' | 'contained' | 'resolved' | 'false_positive';

export interface Incident {
  id: string;
  type: IncidentType;
  severity: RiskLevel;
  status: IncidentStatus;
  detected_at: string;
  resolved_at?: string;
  affected_project?: string;
  affected_session?: string;
  summary: string;
  findings: string[];
  evidence_ids: string[];
  policy_violations: string[];
  suspected_root_cause?: string;
  containment_actions: string[];
  recommended_human_actions: string[];
}
