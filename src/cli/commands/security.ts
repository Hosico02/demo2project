import path from 'node:path';
import { buildThreatModel, explainThreat } from '../../security/ThreatModel.js';
import { writeReport as writeThreatReport } from '../../security/ThreatModelReporter.js';
import { loadSecurityPolicy, validate as validatePolicy, explainAction, check as policyCheck } from '../../security/policy/SecurityPolicyEngine.js';
import { list as listViolations } from '../../security/policy/PolicyViolation.js';
import { POLICY_ACTIONS } from '../../security/policy/PolicySchema.js';
import type { PolicyAction } from '../../security/policy/PolicySchema.js';
import { writeJson } from '../../utils/json.js';
import { writeText, ensureDir } from '../../utils/fs.js';
import { defaultSystemRoot, requireProject } from './_shared.js';

export async function securityThreatModel(flags: Record<string, string | boolean>): Promise<number> {
  const root = defaultSystemRoot();
  const projectPath = typeof flags.project === 'string' ? flags.project : undefined;
  const snap = buildThreatModel({ projectPath });
  const { json, md } = await writeThreatReport(root, snap);
  const out = { total: snap.total_threats, mitigated: snap.mitigated, partially: snap.partially_mitigated, unmitigated: snap.unmitigated, trust_readiness_score: snap.aggregate.trust_readiness_score, top: snap.aggregate.top, report: { json, md } };
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  return 0;
}

export async function securityThreat(flags: Record<string, string | boolean>): Promise<number> {
  const id = typeof flags.id === 'string' ? flags.id : '';
  if (!id) { process.stderr.write('--id required\n'); return 2; }
  const r = explainThreat(id);
  if (!r) { process.stderr.write(`threat ${id} not found\n`); return 1; }
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function policyValidate(): Promise<number> {
  const root = defaultSystemRoot();
  const p = await loadSecurityPolicy(root);
  const v = validatePolicy(p);
  process.stdout.write(JSON.stringify(v, null, 2) + '\n');
  return v.ok ? 0 : 1;
}

export async function policyExplain(flags: Record<string, string | boolean>): Promise<number> {
  const root = defaultSystemRoot();
  const p = await loadSecurityPolicy(root);
  const action = (typeof flags.action === 'string' ? flags.action : '') as PolicyAction;
  if (!action) { process.stderr.write('--action required\n'); return 2; }
  if (!POLICY_ACTIONS.includes(action)) { process.stderr.write(`unknown action: ${action}\n`); return 2; }
  process.stdout.write(JSON.stringify(explainAction(p, action), null, 2) + '\n');
  return 0;
}

export async function policyCheckCmd(flags: Record<string, string | boolean>): Promise<number> {
  const root = defaultSystemRoot();
  const command = typeof flags.command === 'string' ? flags.command : '';
  if (!command) { process.stderr.write('--command required\n'); return 2; }
  const r = await policyCheck(root, { action: 'command_execution', actor: 'cli', command });
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function policyViolations(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = requireProject(flags);
  if (!projectPath) return 2;
  const v = await listViolations(projectPath);
  process.stdout.write(JSON.stringify({ total: v.length, violations: v }, null, 2) + '\n');
  return 0;
}

export async function policyReport(): Promise<number> {
  const root = defaultSystemRoot();
  const p = await loadSecurityPolicy(root);
  const dir = path.join(root, 'reports', 'security');
  await ensureDir(dir);
  await writeJson(path.join(dir, 'policy-report.json'), p);
  const lines = ['# Security Policy', '', `Version: ${p.version}`, `Default decision: ${p.default_decision}`, `Default reason: ${p.default_reason}`, '', '## Rules'];
  for (const r of p.rules) {
    lines.push(`### ${r.id} — ${r.decision}`);
    lines.push(`- Action: ${r.action}`);
    lines.push(`- Risk: ${r.risk_level ?? '—'}`);
    lines.push(`- Reason: ${r.reason}`);
    if (r.match_command_regex) lines.push(`- Command regex: ${r.match_command_regex.join(', ')}`);
    if (r.match_target_prefix) lines.push(`- Target prefix: ${r.match_target_prefix.join(', ')}`);
  }
  await writeText(path.join(dir, 'policy-report.md'), lines.join('\n') + '\n');
  process.stdout.write(JSON.stringify({ rules: p.rules.length, report: { json: path.join(dir, 'policy-report.json'), md: path.join(dir, 'policy-report.md') } }, null, 2) + '\n');
  return 0;
}
