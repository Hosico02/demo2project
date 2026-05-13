import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { append, readAll, reset } from '../../src/governance/audit/AuditLog.js';

describe('AuditLog', () => {
  it('appends events and reads them back', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-'));
    await reset(root);
    await append(root, { actor: 'test', action: 'do', target: 'x', decision: 'allow', risk_level: 'low' });
    await append(root, { actor: 'test', action: 'do', target: 'y', decision: 'deny', risk_level: 'high' });
    const events = await readAll(root);
    expect(events.length).toBe(2);
    expect(events[0]!.action).toBe('do');
  });

  it('redacts secrets in target field', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-'));
    await reset(root);
    await append(root, { actor: 'test', action: 'do', target: 'AKIA' + 'ABCDEFGHIJKLMNOP', decision: 'allow', risk_level: 'low' });
    const events = await readAll(root);
    expect(events[0]!.target).toContain('REDACTED');
  });
});
