/**
 * Security policy schema (Phase 7).
 *
 * A policy is a list of rules. Each rule matches on `action` and optional
 * filters (target_path prefix, command regex, actor, autonomy level) and
 * yields a decision (allow / deny / require_approval / allow_with_constraints).
 *
 * Rules evaluate in order; first match wins. Default deny if no rule matches
 * for a sensitive action class.
 */

export type PolicyAction =
  | 'command_execution'
  | 'file_read'
  | 'file_write'
  | 'file_delete'
  | 'network_access'
  | 'dependency_install'
  | 'package_script_execution'
  | 'hook_installation'
  | 'plugin_installation'
  | 'mcp_server_usage'
  | 'qa_memory_update'
  | 'global_memory_update'
  | 'project_standard_update'
  | 'self_iteration'
  | 'approval_policy_update'
  | 'verification_gate_update'
  | 'redaction_logic_update'
  | 'evidence_graph_update'
  | 'replay_bundle_export'
  | 'report_export'
  | 'modify_security_policy';

export const POLICY_ACTIONS: PolicyAction[] = [
  'command_execution', 'file_read', 'file_write', 'file_delete', 'network_access',
  'dependency_install', 'package_script_execution', 'hook_installation', 'plugin_installation',
  'mcp_server_usage', 'qa_memory_update', 'global_memory_update', 'project_standard_update',
  'self_iteration', 'approval_policy_update', 'verification_gate_update', 'redaction_logic_update',
  'evidence_graph_update', 'replay_bundle_export', 'report_export', 'modify_security_policy',
];

export type Decision = 'allow' | 'deny' | 'require_approval' | 'allow_with_constraints';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface PolicyRule {
  id: string;
  action: PolicyAction | '*';
  decision: Decision;
  reason: string;
  risk_level?: RiskLevel;
  /** glob-ish prefix; if set, target_path must start with one of these */
  match_target_prefix?: string[];
  /** if set, target_path starting with any of these denies match */
  exclude_target_prefix?: string[];
  /** regex applied to command string */
  match_command_regex?: string[];
  /** if set, only matches when actor in list */
  match_actor?: string[];
  /** if set, only matches when autonomy level >= this (lexicographic L0..L5) */
  min_autonomy_level?: string;
  /** constraints applied when decision is allow_with_constraints */
  constraints?: string[];
  /** sets approval expiration in ms when require_approval */
  approval_expires_ms?: number;
}

export interface SecurityPolicy {
  version: string;
  description: string;
  default_decision: Decision;
  default_reason: string;
  /** repos with trust level lower than this are treated as untrusted */
  untrusted_repo_trust_threshold: 'trusted' | 'partially_trusted' | 'untrusted' | 'quarantined';
  rules: PolicyRule[];
}
