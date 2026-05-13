import { CapabilityManager } from '../../security/capabilities/CapabilityManager.js';
import { ALL_CAPABILITIES, HIGH_RISK_CAPABILITIES, describe } from '../../security/capabilities/CapabilityScope.js';
import type { Capability } from '../../security/capabilities/CapabilityScope.js';
import { auditSummary } from '../../security/capabilities/CapabilityAudit.js';
import { defaultSystemRoot, flagString } from './_shared.js';

export async function permissionsList(): Promise<number> {
  const out = { capabilities: ALL_CAPABILITIES, high_risk: HIGH_RISK_CAPABILITIES, descriptions: ALL_CAPABILITIES.reduce<Record<string, string>>((acc, c) => { acc[c] = describe(c); return acc; }, {}) };
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  return 0;
}

export async function permissionsExplain(flags: Record<string, string | boolean>): Promise<number> {
  const cap = flagString(flags, 'capability') as Capability | undefined;
  if (!cap) { process.stderr.write('--capability required\n'); return 2; }
  if (!ALL_CAPABILITIES.includes(cap)) { process.stderr.write(`unknown capability: ${cap}\n`); return 2; }
  process.stdout.write(JSON.stringify({ capability: cap, description: describe(cap), is_high_risk: HIGH_RISK_CAPABILITIES.includes(cap) }, null, 2) + '\n');
  return 0;
}

export async function permissionsIssue(flags: Record<string, string | boolean>): Promise<number> {
  const actor = flagString(flags, 'actor') ?? 'cli';
  const cap = flagString(flags, 'capability') as Capability | undefined;
  const reason = flagString(flags, 'reason') ?? 'cli-issued';
  const approvedBy = flagString(flags, 'approved-by');
  if (!cap) { process.stderr.write('--capability required\n'); return 2; }
  const mgr = new CapabilityManager(defaultSystemRoot());
  try {
    const tok = await mgr.issue({ actor, capabilities: [cap], reason, approved_by: approvedBy });
    process.stdout.write(JSON.stringify(tok, null, 2) + '\n');
    return 0;
  } catch (e) {
    process.stderr.write(`error: ${(e as Error).message}\n`);
    return 1;
  }
}

export async function permissionsRevoke(flags: Record<string, string | boolean>): Promise<number> {
  const id = flagString(flags, 'token');
  const reason = flagString(flags, 'reason') ?? 'manual revoke';
  if (!id) { process.stderr.write('--token required\n'); return 2; }
  const mgr = new CapabilityManager(defaultSystemRoot());
  const t = await mgr.revoke(id, reason);
  if (!t) { process.stderr.write(`token ${id} not found\n`); return 1; }
  process.stdout.write(JSON.stringify(t, null, 2) + '\n');
  return 0;
}

export async function permissionsAudit(): Promise<number> {
  const s = await auditSummary(defaultSystemRoot());
  process.stdout.write(JSON.stringify(s, null, 2) + '\n');
  return 0;
}
