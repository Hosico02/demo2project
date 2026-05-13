import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { CapabilityManager } from '../../src/security/capabilities/CapabilityManager.js';

describe('Least privilege', () => {
  it('self_iterate is not granted alongside modify_security_policy unless approved', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lp-'));
    const m = new CapabilityManager(root);
    await expect(m.issue({ actor: 'executor', capabilities: ['self_iterate', 'modify_security_policy'], reason: 't' })).rejects.toThrow();
    const tok = await m.issue({ actor: 'executor', capabilities: ['self_iterate'], reason: 't', approved_by: 'owner' });
    // Using a capability NOT in the token must fail.
    const r = await m.use(tok.id, 'modify_security_policy');
    expect(r.ok).toBe(false);
  });
});
