import path from 'node:path';
import { promises as fs } from 'node:fs';
import { ensureDir, appendText, readTextSafe } from '../../utils/fs.js';
import { nowIso, shortId } from '../../utils/time.js';
import { redact } from '../../core/redaction.js';
import { hashEvent, GENESIS_HASH } from './AuditHashChain.js';
import type { AuditEvent, AuditEventInput } from './AuditEvent.js';

/**
 * Tamper-evident audit log (Phase 7).
 *
 * Append-only JSONL file under `<system_root>/.demo2project/audit/audit.log`.
 * Each event includes the previous event's hash, forming a chain. AuditVerifier
 * detects any silent edit.
 *
 * Secrets are stripped via `redact()` before persistence.
 */

function logPath(systemRoot: string): string {
  return path.join(systemRoot, '.demo2project', 'audit', 'audit.log');
}

export async function readAll(systemRoot: string): Promise<AuditEvent[]> {
  const txt = await readTextSafe(logPath(systemRoot));
  if (!txt) return [];
  const out: AuditEvent[] = [];
  for (const line of txt.split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line) as AuditEvent); } catch { /* skip malformed */ }
  }
  return out;
}

async function lastHash(systemRoot: string): Promise<string> {
  const events = await readAll(systemRoot);
  return events.length === 0 ? GENESIS_HASH : (events[events.length - 1]!.event_hash);
}

export async function append(systemRoot: string, input: AuditEventInput): Promise<AuditEvent> {
  const prev = await lastHash(systemRoot);
  const meta = redactMetadata(input.metadata ?? {});
  const partial: Omit<AuditEvent, 'event_hash'> = {
    id: shortId('audit'),
    timestamp: nowIso(),
    actor: input.actor,
    action: input.action,
    target: redact(input.target),
    decision: input.decision,
    risk_level: input.risk_level,
    policy_decision_id: input.policy_decision_id,
    approval_id: input.approval_id,
    evidence_ids: input.evidence_ids ?? [],
    incident_id: input.incident_id,
    previous_hash: prev,
    metadata: meta,
  };
  const event: AuditEvent = { ...partial, event_hash: hashEvent(partial) };
  await ensureDir(path.dirname(logPath(systemRoot)));
  await appendText(logPath(systemRoot), JSON.stringify(event) + '\n');
  return event;
}

function redactMetadata(m: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(m)) {
    if (typeof v === 'string') out[k] = redact(v);
    else if (Array.isArray(v)) out[k] = v.map((x) => typeof x === 'string' ? redact(x) : x);
    else out[k] = v;
  }
  return out;
}

export async function reset(systemRoot: string): Promise<void> {
  // Test-only helper. Deletes audit log.
  try { await fs.unlink(logPath(systemRoot)); } catch { /* fine */ }
}
