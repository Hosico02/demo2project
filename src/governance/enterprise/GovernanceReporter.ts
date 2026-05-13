import path from 'node:path';
import { writeJson } from '../../utils/json.js';
import { writeText, ensureDir } from '../../utils/fs.js';
import { loadConfig } from './EnterpriseGovernanceConfig.js';
import { ROLES, describe } from './RoleBasedAccess.js';

export async function writeGovernanceReport(systemRoot: string): Promise<{ json: string; md: string }> {
  const cfg = await loadConfig(systemRoot);
  const roles = ROLES.map(describe);
  const dir = path.join(systemRoot, 'reports', 'governance');
  await ensureDir(dir);
  const jsonPath = path.join(dir, 'enterprise-governance.json');
  const mdPath = path.join(dir, 'enterprise-governance.md');
  await writeJson(jsonPath, { config: cfg, roles });
  const lines = ['# Enterprise Governance', '', `- Team: ${cfg.team_name}`, `- Current actor: ${cfg.current_actor}`, `- Current role: ${cfg.current_role}`, `- Dual approval for critical: ${cfg.enforce_dual_approval_for_critical}`, '', '## Roles'];
  for (const r of roles) {
    lines.push(`### ${r.role}`);
    lines.push(`- Can approve: ${r.approves.join(', ') || '—'}`);
    lines.push(`- Actions: ${r.actions.join(', ') || '—'}`);
  }
  await writeText(mdPath, lines.join('\n') + '\n');
  return { json: jsonPath, md: mdPath };
}
