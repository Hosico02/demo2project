import { describe, it, expect } from 'vitest';
import { advise } from '../../src/product/diagnostics/RemediationAdvisor.js';
import { explainLog } from '../../src/product/diagnostics/TroubleshootingGuide.js';

describe('RemediationAdvisor', () => {
  it('returns steps for known error', () => {
    const r = advise('D2P_VERIFICATION_MISSING');
    expect(r).not.toBeNull();
    expect(r!.steps.length).toBeGreaterThan(0);
  });
  it('null for unknown', () => {
    expect(advise('D2P_NOPE')).toBeNull();
  });
  it('explainLog matches error codes in log text', () => {
    const r = explainLog('something happened\nD2P_SECRET_DETECTED in file foo\nmore');
    expect(r.matches.length).toBe(1);
    expect(r.matches[0]!.code).toBe('D2P_SECRET_DETECTED');
  });
});
