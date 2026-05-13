import path from 'node:path';
import { writeJson, readJsonSafe } from '../../utils/json.js';
import { ensureDir } from '../../utils/fs.js';
import type { Role } from './RoleBasedAccess.js';

export interface EnterpriseGovernanceConfig {
  team_name: string;
  current_actor: string;
  current_role: Role;
  members: { actor: string; role: Role }[];
  enforce_dual_approval_for_critical: boolean;
  data_export_requires_approval: boolean;
  privacy_mode_required: 'normal' | 'private' | 'strict_private' | 'enterprise_restricted';
  restricted_actions: string[];
}

export const DEFAULT_CONFIG: EnterpriseGovernanceConfig = {
  team_name: 'demo2project-default',
  current_actor: 'local-user',
  current_role: 'engineering_lead',
  members: [],
  enforce_dual_approval_for_critical: false,
  data_export_requires_approval: true,
  privacy_mode_required: 'normal',
  restricted_actions: [],
};

const FILE = 'config/enterprise-governance.json';

export async function loadConfig(systemRoot: string): Promise<EnterpriseGovernanceConfig> {
  const p = await readJsonSafe<EnterpriseGovernanceConfig>(path.join(systemRoot, FILE));
  return p ?? DEFAULT_CONFIG;
}

export async function saveConfig(systemRoot: string, c: EnterpriseGovernanceConfig): Promise<string> {
  await ensureDir(path.dirname(path.join(systemRoot, FILE)));
  await writeJson(path.join(systemRoot, FILE), c);
  return path.join(systemRoot, FILE);
}
