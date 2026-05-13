import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTrustReport } from '../../src/governance/TrustReport.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('TrustReport', () => {
  it('builds a trust report against the demo2project repo itself', async () => {
    const r = await buildTrustReport(root);
    expect(r.trust_score).toBeGreaterThanOrEqual(0);
    expect(r.trust_score).toBeLessThanOrEqual(100);
    expect(r.security_policy_status.rules).toBeGreaterThan(20);
    expect(typeof r.privacy_mode).toBe('string');
  });
});
