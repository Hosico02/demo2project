import { nowIso, shortId } from '../../utils/time.js';
import type { Capability, CapabilityScopeSpec } from './CapabilityScope.js';

export interface CapabilityToken {
  id: string;
  actor: string;
  capabilities: Capability[];
  scope: CapabilityScopeSpec;
  issued_at: string;
  expires_at: string;
  max_uses: number;
  used_count: number;
  reason: string;
  approved_by?: string;
  revoked: boolean;
  evidence_ids: string[];
}

export interface IssueTokenInput {
  actor: string;
  capabilities: Capability[];
  scope?: CapabilityScopeSpec;
  expires_in_ms?: number;
  max_uses?: number;
  reason: string;
  approved_by?: string;
  evidence_ids?: string[];
}

export function mintToken(input: IssueTokenInput): CapabilityToken {
  const now = Date.now();
  const ttl = input.expires_in_ms ?? 15 * 60 * 1000;
  return {
    id: shortId('tok'),
    actor: input.actor,
    capabilities: input.capabilities,
    scope: input.scope ?? {},
    issued_at: nowIso(),
    expires_at: new Date(now + ttl).toISOString(),
    max_uses: input.max_uses ?? 100,
    used_count: 0,
    reason: input.reason,
    approved_by: input.approved_by,
    revoked: false,
    evidence_ids: input.evidence_ids ?? [],
  };
}

export function isExpired(t: CapabilityToken, refMs = Date.now()): boolean {
  return Date.parse(t.expires_at) <= refMs;
}

export function canUse(t: CapabilityToken, cap: Capability, refMs = Date.now()): { ok: boolean; reason?: string } {
  if (t.revoked) return { ok: false, reason: 'token revoked' };
  if (isExpired(t, refMs)) return { ok: false, reason: 'token expired' };
  if (t.used_count >= t.max_uses) return { ok: false, reason: 'usage cap reached' };
  if (!t.capabilities.includes(cap)) return { ok: false, reason: `capability ${cap} not granted` };
  return { ok: true };
}
