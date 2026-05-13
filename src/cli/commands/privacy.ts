import { loadMode, setMode } from '../../privacy/PrivacyMode.js';
import { loadPolicy, savePolicy } from '../../privacy/DataRetentionPolicy.js';
import { inventory } from '../../privacy/DataInventory.js';
import { deleteSession, cleanupByRetention } from '../../privacy/DataDeletion.js';
import { privacyReport } from '../../privacy/PrivacyReporter.js';
import { defaultSystemRoot, flagString } from './_shared.js';
import type { PrivacyModeName } from '../../privacy/PrivacyMode.js';

export async function privacyMode(): Promise<number> {
  const m = await loadMode(defaultSystemRoot());
  process.stdout.write(JSON.stringify(m, null, 2) + '\n');
  return 0;
}

export async function privacySetMode(flags: Record<string, string | boolean>): Promise<number> {
  const mode = flagString(flags, 'mode') as PrivacyModeName | undefined;
  if (!mode) { process.stderr.write('--mode required (normal|private|strict_private|enterprise_restricted)\n'); return 2; }
  const r = await setMode(defaultSystemRoot(), mode);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function privacyInventory(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = typeof flags.project === 'string' ? flags.project : undefined;
  const r = await inventory(defaultSystemRoot(), projectPath);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function privacyDelete(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = flagString(flags, 'project');
  const session = flagString(flags, 'session');
  if (!projectPath || !session) { process.stderr.write('--project and --session required\n'); return 2; }
  const r = await deleteSession(defaultSystemRoot(), projectPath, session);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function retentionPolicy(flags: Record<string, string | boolean>): Promise<number> {
  if (flags['set']) {
    const cur = await loadPolicy(defaultSystemRoot());
    if (typeof flags['audit-days'] === 'string') cur.keep_audit_log_days = Number(flags['audit-days']);
    if (typeof flags['session-days'] === 'string') cur.keep_sessions_days = Number(flags['session-days']);
    if (typeof flags['replay-days'] === 'string') cur.keep_replay_bundles_days = Number(flags['replay-days']);
    await savePolicy(defaultSystemRoot(), cur);
    process.stdout.write(JSON.stringify(cur, null, 2) + '\n');
    return 0;
  }
  const p = await loadPolicy(defaultSystemRoot());
  process.stdout.write(JSON.stringify(p, null, 2) + '\n');
  return 0;
}

export async function retentionCleanup(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = typeof flags.project === 'string' ? flags.project : undefined;
  const r = await cleanupByRetention(defaultSystemRoot(), projectPath);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function privacyReportCmd(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = typeof flags.project === 'string' ? flags.project : undefined;
  const r = await privacyReport(defaultSystemRoot(), projectPath);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}
