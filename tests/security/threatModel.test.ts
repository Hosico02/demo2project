import { describe, it, expect } from 'vitest';
import { buildThreatModel, explainThreat } from '../../src/security/ThreatModel.js';
import { THREAT_CATALOG } from '../../src/security/ThreatCatalog.js';

describe('ThreatModel', () => {
  it('builds a snapshot with at least 20 threats', () => {
    const snap = buildThreatModel();
    expect(snap.total_threats).toBeGreaterThanOrEqual(20);
    expect(snap.aggregate.trust_readiness_score).toBeGreaterThanOrEqual(0);
    expect(snap.aggregate.trust_readiness_score).toBeLessThanOrEqual(100);
    expect(snap.aggregate.top.length).toBeGreaterThan(0);
  });
  it('catalogs cover the required threat categories', () => {
    const cats = new Set(THREAT_CATALOG.map((t) => t.category));
    expect(cats.has('malicious_repository')).toBe(true);
    expect(cats.has('prompt_injection')).toBe(true);
    expect(cats.has('secret_exfiltration')).toBe(true);
    expect(cats.has('evidence_log_tampering')).toBe(true);
    expect(cats.has('policy_downgrade_attack')).toBe(true);
  });
  it('explainThreat returns risk score for known id', () => {
    const r = explainThreat('T001');
    expect(r).not.toBeNull();
    expect(r!.risk_score).toBeGreaterThan(0);
  });
  it('explainThreat returns null for unknown id', () => {
    expect(explainThreat('TXX')).toBeNull();
  });
});
