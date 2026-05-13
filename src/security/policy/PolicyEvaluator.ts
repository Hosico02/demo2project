import type { PolicyAction, PolicyRule, SecurityPolicy, Decision, RiskLevel } from './PolicySchema.js';
import { shortId, nowIso } from '../../utils/time.js';

export interface PolicyRequest {
  id: string;
  action: PolicyAction;
  actor: string;
  project_path?: string;
  target_path?: string;
  command?: string;
  network_target?: string;
  risk_level?: RiskLevel;
  autonomy_level?: string;
  requested_capabilities?: string[];
  context?: Record<string, unknown>;
  evidence_ids?: string[];
}

export interface PolicyDecision {
  request_id: string;
  decision: Decision;
  reason: string;
  matched_rules: string[];
  constraints: string[];
  approval_required: boolean;
  risk_level: RiskLevel;
  expires_at?: string;
  evidence_ids: string[];
  evaluated_at: string;
}

export function newRequest(partial: Partial<PolicyRequest> & { action: PolicyAction; actor: string }): PolicyRequest {
  return {
    id: shortId('preq'),
    action: partial.action,
    actor: partial.actor,
    project_path: partial.project_path,
    target_path: partial.target_path,
    command: partial.command,
    network_target: partial.network_target,
    risk_level: partial.risk_level,
    autonomy_level: partial.autonomy_level,
    requested_capabilities: partial.requested_capabilities ?? [],
    context: partial.context ?? {},
    evidence_ids: partial.evidence_ids ?? [],
  };
}

function ruleMatches(rule: PolicyRule, req: PolicyRequest): boolean {
  if (rule.action !== '*' && rule.action !== req.action) return false;
  if (rule.match_target_prefix && rule.match_target_prefix.length > 0) {
    if (!req.target_path) return false;
    const tgt = req.target_path;
    if (!rule.match_target_prefix.some((p) => tgt === p || tgt.startsWith(p) || tgt.includes('/' + p))) return false;
  }
  if (rule.exclude_target_prefix && req.target_path) {
    const tgt = req.target_path;
    if (rule.exclude_target_prefix.some((p) => tgt === p || tgt.startsWith(p))) return false;
  }
  if (rule.match_command_regex && rule.match_command_regex.length > 0) {
    if (!req.command) return false;
    const cmd = req.command;
    if (!rule.match_command_regex.some((re) => new RegExp(re).test(cmd))) return false;
  }
  if (rule.match_actor && rule.match_actor.length > 0) {
    if (!rule.match_actor.includes(req.actor)) return false;
  }
  if (rule.min_autonomy_level && req.autonomy_level) {
    if (req.autonomy_level < rule.min_autonomy_level) return false;
  }
  return true;
}

export function evaluate(policy: SecurityPolicy, req: PolicyRequest): PolicyDecision {
  const matched: string[] = [];
  let chosen: PolicyRule | null = null;
  for (const rule of policy.rules) {
    if (ruleMatches(rule, req)) {
      matched.push(rule.id);
      chosen = rule;
      break;
    }
  }
  if (chosen) {
    const expiresAt = chosen.decision === 'require_approval' && chosen.approval_expires_ms
      ? new Date(Date.now() + chosen.approval_expires_ms).toISOString()
      : undefined;
    return {
      request_id: req.id,
      decision: chosen.decision,
      reason: chosen.reason,
      matched_rules: matched,
      constraints: chosen.constraints ?? [],
      approval_required: chosen.decision === 'require_approval',
      risk_level: chosen.risk_level ?? req.risk_level ?? 'medium',
      expires_at: expiresAt,
      evidence_ids: req.evidence_ids ?? [],
      evaluated_at: nowIso(),
    };
  }
  return {
    request_id: req.id,
    decision: policy.default_decision,
    reason: policy.default_reason,
    matched_rules: [],
    constraints: [],
    approval_required: policy.default_decision === 'require_approval',
    risk_level: req.risk_level ?? 'medium',
    evidence_ids: req.evidence_ids ?? [],
    evaluated_at: nowIso(),
  };
}
