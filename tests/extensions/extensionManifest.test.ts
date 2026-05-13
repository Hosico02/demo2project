import { describe, it, expect } from 'vitest';
import { validate } from '../../src/extensions/ExtensionManifest.js';

describe('ExtensionManifest validation', () => {
  it('rejects missing fields', () => {
    const r = validate({ name: 'x' });
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });
  it('rejects invalid type', () => {
    const r = validate({ name: 'x', version: '1', author: 'a', type: 'unknown', entry: 'i', permissions_required: [], supported_demo2project_versions: [], risk_level: 'low' });
    expect(r.ok).toBe(false);
  });
  it('warns when modify_security_policy requested', () => {
    const r = validate({ name: 'x', version: '1', author: 'a', type: 'policy_rule', entry: 'i', permissions_required: ['modify_security_policy'], supported_demo2project_versions: [], risk_level: 'high' });
    expect(r.warnings.some((w) => w.includes('modify_security_policy'))).toBe(true);
  });
});
