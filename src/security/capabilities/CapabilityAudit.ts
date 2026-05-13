import { CapabilityManager } from './CapabilityManager.js';

export async function auditSummary(systemRoot: string): Promise<unknown> {
  const m = new CapabilityManager(systemRoot);
  const sum = await m.auditAll();
  const tokens = await m.list();
  return { ...sum, tokens: tokens.map((t) => ({ id: t.id, actor: t.actor, capabilities: t.capabilities, revoked: t.revoked, expires_at: t.expires_at, used_count: t.used_count, max_uses: t.max_uses })) };
}
