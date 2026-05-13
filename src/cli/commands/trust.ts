import { evaluateTrust, setTrust, quarantine as q, unquarantine as uq } from '../../security/untrusted/RepositoryTrustEvaluator.js';
import { describeAllowedActions } from '../../security/untrusted/QuarantineMode.js';
import type { TrustLevel } from '../../security/untrusted/TrustLevel.js';
import { writeTrustReport, buildTrustReport } from '../../governance/TrustReport.js';
import { defaultSystemRoot, requireProject, flagString } from './_shared.js';

export async function trustCheck(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = requireProject(flags);
  if (!projectPath) return 2;
  const rec = await evaluateTrust(projectPath);
  const allowed = describeAllowedActions(rec);
  process.stdout.write(JSON.stringify({ trust: rec, allowed }, null, 2) + '\n');
  return 0;
}

export async function trustSet(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = requireProject(flags);
  if (!projectPath) return 2;
  const level = flagString(flags, 'level') as TrustLevel | undefined;
  if (!level) { process.stderr.write('--level required\n'); return 2; }
  const reason = flagString(flags, 'reason') ?? 'user set';
  const rec = await setTrust(projectPath, level, 'user', reason);
  process.stdout.write(JSON.stringify(rec, null, 2) + '\n');
  return 0;
}

export async function repoQuarantine(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = requireProject(flags);
  if (!projectPath) return 2;
  const reason = flagString(flags, 'reason') ?? 'manual quarantine';
  const r = await q(projectPath, reason);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function repoUnquarantine(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = requireProject(flags);
  if (!projectPath) return 2;
  const r = await uq(projectPath);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function trustReport(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = typeof flags.project === 'string' ? flags.project : undefined;
  const root = defaultSystemRoot();
  const r = await writeTrustReport(root, projectPath);
  process.stdout.write(JSON.stringify({ trust_score: r.data.trust_score, report: { json: r.json, md: r.md } }, null, 2) + '\n');
  return 0;
}

export async function trustExplain(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = typeof flags.project === 'string' ? flags.project : undefined;
  const data = await buildTrustReport(defaultSystemRoot(), projectPath);
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  return 0;
}
