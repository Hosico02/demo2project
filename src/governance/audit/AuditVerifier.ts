import { readAll } from './AuditLog.js';
import { verifyChain } from './AuditHashChain.js';
import type { ChainVerification } from './AuditHashChain.js';
import type { AuditEvent } from './AuditEvent.js';

export async function verify(systemRoot: string): Promise<ChainVerification> {
  const events = await readAll(systemRoot);
  return verifyChain(events);
}

export async function findByEventId(systemRoot: string, id: string): Promise<AuditEvent | null> {
  const events = await readAll(systemRoot);
  return events.find((e) => e.id === id) ?? null;
}
