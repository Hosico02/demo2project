import crypto from 'node:crypto';
import type { AuditEvent } from './AuditEvent.js';

export const GENESIS_HASH = '0'.repeat(64);

export function hashEvent(e: Omit<AuditEvent, 'event_hash'>): string {
  // Stable canonical serialization for hashing. Drop event_hash, keep everything else.
  const canonical = JSON.stringify({
    id: e.id,
    timestamp: e.timestamp,
    actor: e.actor,
    action: e.action,
    target: e.target,
    decision: e.decision,
    risk_level: e.risk_level,
    policy_decision_id: e.policy_decision_id ?? null,
    approval_id: e.approval_id ?? null,
    evidence_ids: e.evidence_ids ?? [],
    incident_id: e.incident_id ?? null,
    previous_hash: e.previous_hash,
    metadata: e.metadata ?? {},
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export interface ChainVerification {
  ok: boolean;
  total: number;
  broken_at?: number;
  reason?: string;
}

export function verifyChain(events: AuditEvent[]): ChainVerification {
  let prev = GENESIS_HASH;
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    if (e.previous_hash !== prev) {
      return { ok: false, total: events.length, broken_at: i, reason: `previous_hash mismatch at index ${i}` };
    }
    const expected = hashEvent({ ...e } as Omit<AuditEvent, 'event_hash'>);
    if (e.event_hash !== expected) {
      return { ok: false, total: events.length, broken_at: i, reason: `event_hash mismatch at index ${i}` };
    }
    prev = e.event_hash;
  }
  return { ok: true, total: events.length };
}
