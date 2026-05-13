import { ROLES, describe, canApprove, canPerform } from '../../governance/enterprise/RoleBasedAccess.js';
import type { Role } from '../../governance/enterprise/RoleBasedAccess.js';
import { loadConfig } from '../../governance/enterprise/EnterpriseGovernanceConfig.js';
import { writeGovernanceReport } from '../../governance/enterprise/GovernanceReporter.js';
import { defaultSystemRoot, flagString } from './_shared.js';
import type { RiskLevel } from '../../security/policy/PolicySchema.js';

export async function governanceRoles(): Promise<number> {
  process.stdout.write(JSON.stringify({ roles: ROLES.map(describe) }, null, 2) + '\n');
  return 0;
}

export async function governanceWhoami(): Promise<number> {
  const cfg = await loadConfig(defaultSystemRoot());
  process.stdout.write(JSON.stringify({ actor: cfg.current_actor, role: cfg.current_role, team: cfg.team_name, permissions: describe(cfg.current_role) }, null, 2) + '\n');
  return 0;
}

export async function governanceCan(flags: Record<string, string | boolean>): Promise<number> {
  const cfg = await loadConfig(defaultSystemRoot());
  const action = flagString(flags, 'action');
  if (!action) { process.stderr.write('--action required\n'); return 2; }
  const risk = flagString(flags, 'risk') as RiskLevel | undefined;
  const result = {
    actor: cfg.current_actor,
    role: cfg.current_role,
    action,
    can_perform: canPerform(cfg.current_role as Role, action),
    can_approve_risk: risk ? canApprove(cfg.current_role as Role, risk) : null,
  };
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  return 0;
}

export async function governanceReport(): Promise<number> {
  const r = await writeGovernanceReport(defaultSystemRoot());
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}
