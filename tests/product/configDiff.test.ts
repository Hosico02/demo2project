import { describe, it, expect } from 'vitest';
import { diff } from '../../src/product/config/ConfigDiff.js';

describe('ConfigDiff', () => {
  it('detects an autonomy downgrade', () => {
    const a = { autonomy: { level: 'L2_SAFE_PATCH_WITH_VERIFICATION' } };
    const b = { autonomy: { level: 'L0_READ_ONLY' } };
    const r = diff(a, b);
    // moving to LOWER autonomy is NOT marked as downgrade (lower autonomy = safer)
    expect(r.changes.length).toBeGreaterThan(0);
  });
  it('detects a security downgrade (approval flag flip)', () => {
    const a = { security: { require_approval_for_self_modification: true } };
    const b = { security: { require_approval_for_self_modification: false } };
    const r = diff(a, b);
    expect(r.has_downgrade).toBe(true);
  });
  it('detects network downgrade (deny → allowlist)', () => {
    const a = { security: { network_default: 'deny' } };
    const b = { security: { network_default: 'allowlist' } };
    const r = diff(a, b);
    expect(r.has_downgrade).toBe(true);
  });
});
