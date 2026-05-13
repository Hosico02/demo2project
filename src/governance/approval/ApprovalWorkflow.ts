import { nowIso } from '../../utils/time.js';
import type { CreateApprovalRequestInput, ApprovalRequest } from './ApprovalRequest.js';
import { newRequest, isExpired } from './ApprovalRequest.js';
import { save, load, list } from './ApprovalStore.js';
import { DEFAULT_APPROVAL_POLICY, canApprove } from './ApprovalPolicy.js';
import { append as auditAppend } from '../audit/AuditLog.js';

export class ApprovalWorkflow {
  constructor(private readonly systemRoot: string) {}

  async create(input: CreateApprovalRequestInput): Promise<ApprovalRequest> {
    const r = newRequest(input);
    await save(this.systemRoot, r);
    await auditAppend(this.systemRoot, {
      actor: r.actor,
      action: 'approval:requested',
      target: r.action,
      decision: 'pending',
      risk_level: r.risk_level,
      policy_decision_id: r.policy_decision_id,
      metadata: { capabilities: r.requested_capabilities, affected_files: r.affected_files, scope: r.scope },
    });
    return r;
  }

  async list(): Promise<ApprovalRequest[]> {
    const all = await list(this.systemRoot);
    const out: ApprovalRequest[] = [];
    for (const r of all) {
      if (r.status === 'pending' && isExpired(r)) {
        r.status = 'expired';
        await save(this.systemRoot, r);
      }
      out.push(r);
    }
    return out;
  }

  async get(id: string): Promise<ApprovalRequest | null> {
    const r = await load(this.systemRoot, id);
    if (!r) return null;
    if (r.status === 'pending' && isExpired(r)) {
      r.status = 'expired';
      await save(this.systemRoot, r);
    }
    return r;
  }

  async approve(id: string, role: string, reason: string): Promise<ApprovalRequest | null> {
    const r = await this.get(id);
    if (!r) return null;
    if (r.status !== 'pending') throw new Error(`approval ${id} not pending (status=${r.status})`);
    if (!canApprove(DEFAULT_APPROVAL_POLICY, role, r.risk_level)) {
      throw new Error(`role '${role}' cannot approve risk level '${r.risk_level}'`);
    }
    r.status = 'approved';
    r.approved_by = role;
    r.decided_at = nowIso();
    r.decision_reason = reason;
    await save(this.systemRoot, r);
    await auditAppend(this.systemRoot, {
      actor: role,
      action: 'approval:approved',
      target: id,
      decision: 'approved',
      risk_level: r.risk_level,
      approval_id: id,
      metadata: { reason },
    });
    return r;
  }

  async reject(id: string, role: string, reason: string): Promise<ApprovalRequest | null> {
    const r = await this.get(id);
    if (!r) return null;
    if (r.status !== 'pending') throw new Error(`approval ${id} not pending (status=${r.status})`);
    r.status = 'rejected';
    r.rejected_by = role;
    r.decided_at = nowIso();
    r.decision_reason = reason;
    await save(this.systemRoot, r);
    await auditAppend(this.systemRoot, {
      actor: role,
      action: 'approval:rejected',
      target: id,
      decision: 'rejected',
      risk_level: r.risk_level,
      approval_id: id,
      metadata: { reason },
    });
    return r;
  }

  async revoke(id: string, role: string, reason: string): Promise<ApprovalRequest | null> {
    const r = await this.get(id);
    if (!r) return null;
    r.status = 'revoked';
    r.decision_reason = `revoked by ${role}: ${reason}`;
    r.decided_at = nowIso();
    await save(this.systemRoot, r);
    await auditAppend(this.systemRoot, {
      actor: role,
      action: 'approval:revoked',
      target: id,
      decision: 'revoked',
      risk_level: r.risk_level,
      approval_id: id,
      metadata: { reason },
    });
    return r;
  }
}
