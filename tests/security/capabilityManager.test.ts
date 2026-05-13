import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { CapabilityManager } from '../../src/security/capabilities/CapabilityManager.js';

describe('CapabilityManager', () => {
  it('issues low-risk tokens and rejects high-risk without approval', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-'));
    const m = new CapabilityManager(root);
    const tok = await m.issue({ actor: 'executor', capabilities: ['read_project_files'], reason: 'test' });
    expect(tok.id).toBeTruthy();
    expect(tok.capabilities).toContain('read_project_files');
    await expect(m.issue({ actor: 'executor', capabilities: ['modify_security_policy'], reason: 'test' })).rejects.toThrow(/approved_by/);
  });

  it('records use and respects max_uses', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-'));
    const m = new CapabilityManager(root);
    const tok = await m.issue({ actor: 'executor', capabilities: ['run_safe_commands'], reason: 't', max_uses: 1 });
    const r1 = await m.use(tok.id, 'run_safe_commands');
    expect(r1.ok).toBe(true);
    const r2 = await m.use(tok.id, 'run_safe_commands');
    expect(r2.ok).toBe(false);
  });

  it('revokes tokens', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-'));
    const m = new CapabilityManager(root);
    const tok = await m.issue({ actor: 'executor', capabilities: ['read_project_files'], reason: 't' });
    await m.revoke(tok.id, 'just because');
    const r = await m.use(tok.id, 'read_project_files');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/revoked/);
  });
});
