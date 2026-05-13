import { describe, it, expect } from 'vitest';
import { applyProfile, PROFILE_DESCRIPTIONS } from '../../src/product/config/ConfigProfiles.js';
import { DEFAULT_CONFIG } from '../../src/product/config/ConfigSchema.js';

describe('Setup profiles', () => {
  it('conservative caps autonomy at L0 and denies network', () => {
    const r = applyProfile(DEFAULT_CONFIG, 'conservative');
    expect(r.autonomy.level).toBe('L0_READ_ONLY');
    expect(r.security.network_default).toBe('deny');
    expect(r.privacy.mode).toBe('private');
  });
  it('balanced is L2 safe-patch', () => {
    const r = applyProfile(DEFAULT_CONFIG, 'balanced');
    expect(r.autonomy.level).toBe('L2_SAFE_PATCH_WITH_VERIFICATION');
  });
  it('autonomous allows allowlist network but keeps approval gating', () => {
    const r = applyProfile(DEFAULT_CONFIG, 'autonomous');
    expect(r.security.network_default).toBe('allowlist');
    expect(r.security.require_approval_for_self_modification).toBe(true);
  });
  it('descriptions cover all three profiles', () => {
    expect(PROFILE_DESCRIPTIONS.conservative).toBeTruthy();
    expect(PROFILE_DESCRIPTIONS.balanced).toBeTruthy();
    expect(PROFILE_DESCRIPTIONS.autonomous).toBeTruthy();
  });
});
