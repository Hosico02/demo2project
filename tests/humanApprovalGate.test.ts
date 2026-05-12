import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  classifyRisk,
  recordPendingApprovals,
  listApprovals,
  decideApproval,
  DEFAULT_APPROVAL_POLICY,
} from '../src/core/approvalGate.js';

async function tmp() { return fs.mkdtemp(path.join(tmpdir(), 'd2p-apv-')); }

describe('Approval gate', () => {
  it('classifies risky paths correctly', () => {
    expect(classifyRisk('src/core/safety.ts', DEFAULT_APPROVAL_POLICY)).toBe('high');
    expect(classifyRisk('src/agents/Foo.ts', DEFAULT_APPROVAL_POLICY)).toBe('medium');
    expect(classifyRisk('README.md', DEFAULT_APPROVAL_POLICY)).toBe('low');
  });

  it('records pending approvals for medium and high risk', async () => {
    const proj = await tmp();
    const pending = await recordPendingApprovals(
      proj,
      ['README.md', 'src/agents/X.ts', 'src/core/safety.ts'],
      'iter_apv',
      DEFAULT_APPROVAL_POLICY,
    );
    expect(pending.length).toBe(2); // medium + high
    const list = await listApprovals(proj);
    expect(list.length).toBe(2);
  });

  it('approve / reject transitions are persisted', async () => {
    const proj = await tmp();
    const pending = await recordPendingApprovals(proj, ['src/agents/Y.ts'], 'iter', DEFAULT_APPROVAL_POLICY);
    const id = pending[0]!.id;
    const r = await decideApproval(proj, id, 'approved', 'looks good', 'tester');
    expect(r?.status).toBe('approved');
    expect(r?.approver).toBe('tester');
  });
});
