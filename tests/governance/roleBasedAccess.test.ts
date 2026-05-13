import { describe, it, expect } from 'vitest';
import { canApprove, canPerform, describe as describeRole, ROLES } from '../../src/governance/enterprise/RoleBasedAccess.js';

describe('RoleBasedAccess', () => {
  it('developer cannot approve high', () => {
    expect(canApprove('developer', 'high')).toBe(false);
    expect(canApprove('developer', 'low')).toBe(true);
  });
  it('owner can approve critical', () => {
    expect(canApprove('owner', 'critical')).toBe(true);
  });
  it('auditor cannot run iterate', () => {
    expect(canPerform('auditor', 'run_iterate')).toBe(false);
    expect(canPerform('auditor', 'view_audit')).toBe(true);
  });
  it('describe returns role spec', () => {
    for (const r of ROLES) {
      const d = describeRole(r);
      expect(d.role).toBe(r);
    }
  });
});
