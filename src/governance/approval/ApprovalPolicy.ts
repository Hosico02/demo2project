import type { RiskLevel } from '../../security/policy/PolicySchema.js';

export interface ApprovalPolicySpec {
  /** roles that can approve at each risk level */
  approver_by_risk: Record<RiskLevel, string[]>;
  /** maximum default ttl in ms */
  max_ttl_ms: number;
  /** require dual approval at or above this risk */
  dual_approval_at: RiskLevel | 'never';
}

export const DEFAULT_APPROVAL_POLICY: ApprovalPolicySpec = {
  approver_by_risk: {
    low: ['developer', 'engineering_lead', 'security_reviewer', 'owner'],
    medium: ['engineering_lead', 'security_reviewer', 'owner'],
    high: ['security_reviewer', 'owner'],
    critical: ['owner'],
  },
  max_ttl_ms: 24 * 60 * 60 * 1000,
  dual_approval_at: 'critical',
};

export function canApprove(policy: ApprovalPolicySpec, role: string, risk: RiskLevel): boolean {
  return policy.approver_by_risk[risk].includes(role);
}
