import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { ApprovalWorkflow } from '../../src/governance/approval/ApprovalWorkflow.js';

describe('ApprovalWorkflow', () => {
  it('approves a low-risk request as developer', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'apw-'));
    const wf = new ApprovalWorkflow(root);
    const r = await wf.create({ action: 'file_write', actor: 'dev', requested_capabilities: ['write_project_files'], risk_level: 'low', reason: 'fix' });
    const d = await wf.approve(r.id, 'developer', 'looks ok');
    expect(d?.status).toBe('approved');
  });

  it('rejects when role cannot approve risk', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'apw-'));
    const wf = new ApprovalWorkflow(root);
    const r = await wf.create({ action: 'self_iteration', actor: 'sys', requested_capabilities: ['self_iterate'], risk_level: 'critical', reason: 'evolve' });
    await expect(wf.approve(r.id, 'developer', 'sure')).rejects.toThrow();
  });

  it('marks expired when ttl elapsed', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'apw-'));
    const wf = new ApprovalWorkflow(root);
    const r = await wf.create({ action: 'x', actor: 'a', requested_capabilities: [], risk_level: 'low', reason: 'r', expires_in_ms: 1 });
    await new Promise((res) => setTimeout(res, 10));
    const got = await wf.get(r.id);
    expect(got?.status).toBe('expired');
  });
});
