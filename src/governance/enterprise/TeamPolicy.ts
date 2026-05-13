import type { EnterpriseGovernanceConfig } from './EnterpriseGovernanceConfig.js';
import type { Role } from './RoleBasedAccess.js';

export function getActorRole(cfg: EnterpriseGovernanceConfig, actor: string): Role | null {
  if (actor === cfg.current_actor) return cfg.current_role;
  const m = cfg.members.find((x) => x.actor === actor);
  return m?.role ?? null;
}

export function isRestricted(cfg: EnterpriseGovernanceConfig, action: string): boolean {
  return cfg.restricted_actions.includes(action);
}
