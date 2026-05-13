import { describe, it, expect } from 'vitest';
import { hashEvent, verifyChain, GENESIS_HASH } from '../../src/governance/audit/AuditHashChain.js';
import type { AuditEvent } from '../../src/governance/audit/AuditEvent.js';

function makeEvent(prev: string, id: string): AuditEvent {
  const base = { id, timestamp: '2026-01-01T00:00:00Z', actor: 't', action: 'a', target: 'tgt', decision: 'allow', risk_level: 'low' as const, evidence_ids: [], metadata: {}, previous_hash: prev };
  const event_hash = hashEvent(base);
  return { ...base, event_hash };
}

describe('AuditHashChain', () => {
  it('verifies a clean chain', () => {
    const e1 = makeEvent(GENESIS_HASH, 'a');
    const e2 = makeEvent(e1.event_hash, 'b');
    const r = verifyChain([e1, e2]);
    expect(r.ok).toBe(true);
  });
  it('detects tampering', () => {
    const e1 = makeEvent(GENESIS_HASH, 'a');
    const e2 = makeEvent(e1.event_hash, 'b');
    const tampered: AuditEvent = { ...e2, actor: 'mallory' };
    const r = verifyChain([e1, tampered]);
    expect(r.ok).toBe(false);
    expect(r.broken_at).toBe(1);
  });
  it('detects broken previous_hash', () => {
    const e1 = makeEvent(GENESIS_HASH, 'a');
    const e2 = makeEvent('deadbeef', 'b');
    const r = verifyChain([e1, e2]);
    expect(r.ok).toBe(false);
  });
});
