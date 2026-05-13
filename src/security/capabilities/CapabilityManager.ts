import path from 'node:path';
import { promises as fs } from 'node:fs';
import { ensureDir } from '../../utils/fs.js';
import { writeJson, readJsonSafe } from '../../utils/json.js';
import { stateDir } from '../../utils/paths.js';
import { nowIso } from '../../utils/time.js';
import type { Capability } from './CapabilityScope.js';
import { HIGH_RISK_CAPABILITIES } from './CapabilityScope.js';
import { canUse, mintToken } from './CapabilityToken.js';
import type { CapabilityToken, IssueTokenInput } from './CapabilityToken.js';
import { append as auditAppend } from '../../governance/audit/AuditLog.js';

function tokensDir(systemRoot: string): string {
  return path.join(systemRoot, '.demo2project', 'capabilities');
}

export class CapabilityManager {
  constructor(private readonly systemRoot: string) {}

  async issue(input: IssueTokenInput): Promise<CapabilityToken> {
    const requestsHighRisk = input.capabilities.some((c) => HIGH_RISK_CAPABILITIES.includes(c));
    if (requestsHighRisk && !input.approved_by) {
      throw new Error('high-risk capability requires approved_by');
    }
    const tok = mintToken(input);
    await ensureDir(tokensDir(this.systemRoot));
    await writeJson(path.join(tokensDir(this.systemRoot), `${tok.id}.json`), tok);
    await auditAppend(this.systemRoot, {
      actor: 'capability_manager',
      action: 'capability:issue',
      target: tok.id,
      decision: 'issued',
      risk_level: requestsHighRisk ? 'high' : 'low',
      metadata: { actor: tok.actor, capabilities: tok.capabilities, expires_at: tok.expires_at, approved_by: tok.approved_by },
    });
    return tok;
  }

  async load(id: string): Promise<CapabilityToken | null> {
    return readJsonSafe<CapabilityToken>(path.join(tokensDir(this.systemRoot), `${id}.json`));
  }

  async list(): Promise<CapabilityToken[]> {
    let entries: string[] = [];
    try { entries = await fs.readdir(tokensDir(this.systemRoot)); } catch { return []; }
    const out: CapabilityToken[] = [];
    for (const f of entries.filter((e) => e.endsWith('.json'))) {
      const r = await readJsonSafe<CapabilityToken>(path.join(tokensDir(this.systemRoot), f));
      if (r) out.push(r);
    }
    return out.sort((a, b) => a.issued_at.localeCompare(b.issued_at));
  }

  async revoke(id: string, reason: string): Promise<CapabilityToken | null> {
    const t = await this.load(id);
    if (!t) return null;
    t.revoked = true;
    t.reason = `${t.reason} | revoked: ${reason}`;
    await writeJson(path.join(tokensDir(this.systemRoot), `${id}.json`), t);
    await auditAppend(this.systemRoot, {
      actor: 'capability_manager',
      action: 'capability:revoke',
      target: id,
      decision: 'revoked',
      risk_level: 'medium',
      metadata: { reason },
    });
    return t;
  }

  async use(id: string, cap: Capability): Promise<{ ok: boolean; reason?: string }> {
    const t = await this.load(id);
    if (!t) return { ok: false, reason: 'token not found' };
    const check = canUse(t, cap);
    if (!check.ok) {
      await auditAppend(this.systemRoot, {
        actor: 'capability_manager',
        action: 'capability:deny',
        target: id,
        decision: 'denied',
        risk_level: 'medium',
        metadata: { capability: cap, reason: check.reason },
      });
      return check;
    }
    t.used_count += 1;
    await writeJson(path.join(tokensDir(this.systemRoot), `${id}.json`), t);
    await auditAppend(this.systemRoot, {
      actor: 'capability_manager',
      action: 'capability:use',
      target: id,
      decision: 'used',
      risk_level: 'low',
      metadata: { capability: cap, used_count: t.used_count },
    });
    return { ok: true };
  }

  async auditAll(): Promise<{ total: number; active: number; expired: number; revoked: number; high_risk: number; updated_at: string }> {
    const tokens = await this.list();
    const now = Date.now();
    let active = 0, expired = 0, revoked = 0, highRisk = 0;
    for (const t of tokens) {
      if (t.revoked) revoked++;
      else if (Date.parse(t.expires_at) <= now) expired++;
      else active++;
      if (t.capabilities.some((c) => HIGH_RISK_CAPABILITIES.includes(c))) highRisk++;
    }
    return { total: tokens.length, active, expired, revoked, high_risk: highRisk, updated_at: nowIso() };
  }
}
