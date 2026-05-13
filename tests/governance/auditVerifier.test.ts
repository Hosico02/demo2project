import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { append, reset } from '../../src/governance/audit/AuditLog.js';
import { verify, findByEventId } from '../../src/governance/audit/AuditVerifier.js';

describe('AuditVerifier', () => {
  it('verifies live audit log', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'av-'));
    await reset(root);
    await append(root, { actor: 't', action: 'a', target: 'x', decision: 'allow', risk_level: 'low' });
    const e2 = await append(root, { actor: 't', action: 'b', target: 'y', decision: 'allow', risk_level: 'low' });
    const r = await verify(root);
    expect(r.ok).toBe(true);
    const found = await findByEventId(root, e2.id);
    expect(found?.action).toBe('b');
  });
});
