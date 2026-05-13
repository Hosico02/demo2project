import { describe, it, expect } from 'vitest';
import { ERROR_CATALOG, findError } from '../../src/product/diagnostics/ErrorCatalog.js';

describe('ErrorCatalog', () => {
  it('has all expected codes', () => {
    const codes = ERROR_CATALOG.map((e) => e.code);
    for (const c of ['D2P_CONFIG_MISSING', 'D2P_POLICY_INVALID', 'D2P_VERIFICATION_MISSING', 'D2P_UNTRUSTED_REPO_BLOCKED', 'D2P_SECRET_DETECTED', 'D2P_APPROVAL_REQUIRED', 'D2P_AUDIT_CHAIN_BROKEN', 'D2P_PROVIDER_PARSE_FAILED']) {
      expect(codes).toContain(c);
    }
  });
  it('findError returns entry with required fields', () => {
    const e = findError('D2P_CONFIG_MISSING')!;
    expect(e.title).toBeTruthy();
    expect(e.likely_causes.length).toBeGreaterThan(0);
    expect(e.recommended_actions.length).toBeGreaterThan(0);
    expect(e.related_commands.length).toBeGreaterThan(0);
  });
  it('returns undefined for unknown code', () => {
    expect(findError('D2P_NOPE')).toBeUndefined();
  });
});
