import type { RiskLevel } from '../../security/policy/PolicySchema.js';

export type Role = 'owner' | 'security_reviewer' | 'engineering_lead' | 'developer' | 'auditor' | 'read_only';

export const ROLES: Role[] = ['owner', 'security_reviewer', 'engineering_lead', 'developer', 'auditor', 'read_only'];

const APPROVE_RANK: Record<Role, RiskLevel[]> = {
  owner: ['low', 'medium', 'high', 'critical'],
  security_reviewer: ['low', 'medium', 'high'],
  engineering_lead: ['low', 'medium'],
  developer: ['low'],
  auditor: [],
  read_only: [],
};

const ACTION_PERMISSIONS: Record<Role, Set<string>> = {
  owner: new Set(['*']),
  security_reviewer: new Set(['approve_high', 'view_reports', 'view_audit', 'manage_incident', 'modify_security_policy_with_approval']),
  engineering_lead: new Set(['approve_medium', 'view_reports', 'view_audit', 'run_iterate', 'run_autonomy']),
  developer: new Set(['approve_low', 'view_reports', 'run_iterate']),
  auditor: new Set(['view_reports', 'view_audit', 'verify_audit']),
  read_only: new Set(['view_reports']),
};

export function canApprove(role: Role, risk: RiskLevel): boolean {
  return APPROVE_RANK[role].includes(risk);
}

export function canPerform(role: Role, action: string): boolean {
  const perms = ACTION_PERMISSIONS[role];
  return perms.has('*') || perms.has(action);
}

export function describe(role: Role): { role: Role; approves: RiskLevel[]; actions: string[] } {
  return { role, approves: APPROVE_RANK[role], actions: Array.from(ACTION_PERMISSIONS[role]) };
}
