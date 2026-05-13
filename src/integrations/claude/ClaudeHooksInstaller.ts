import path from 'node:path';
import { promises as fs } from 'node:fs';
import crypto from 'node:crypto';
import { ensureDir, fileExists, readTextSafe, writeText } from '../../utils/fs.js';

export const BASELINE_HOOKS = [
  'pre-tool-use-safety.mjs',
  'post-tool-use-event-recorder.mjs',
  'stop-verification-gate.mjs',
];

export const SECURITY_HOOKS = [
  'pre-tool-use-security-policy.mjs',
  'pre-tool-use-command-guard.mjs',
  'pre-tool-use-file-access-guard.mjs',
  'pre-tool-use-secret-protection.mjs',
  'post-tool-use-audit-recorder.mjs',
  'post-tool-use-evidence-recorder.mjs',
  'stop-verification-and-policy-gate.mjs',
  'stop-incident-check.mjs',
];

export interface InstallReport {
  installed: string[];
  skipped: string[];
  location: string;
  dry_run: boolean;
  hash_manifest: Record<string, string>;
}

function installDir(projectPath: string, scope: 'baseline' | 'security'): string {
  return path.join(projectPath, '.claude', 'hooks', scope === 'security' ? 'demo2project-security' : 'demo2project');
}

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
}

export async function install(systemRoot: string, projectPath: string, scope: 'baseline' | 'security', opts: { dryRun?: boolean } = {}): Promise<InstallReport> {
  const src = path.join(systemRoot, 'templates', 'claude', 'hooks');
  const dst = installDir(projectPath, scope);
  const files = scope === 'security' ? SECURITY_HOOKS : BASELINE_HOOKS;
  const installed: string[] = [];
  const skipped: string[] = [];
  const manifest: Record<string, string> = {};
  if (!opts.dryRun) await ensureDir(dst);
  for (const f of files) {
    const s = path.join(src, f);
    if (!fileExists(s)) { skipped.push(f); continue; }
    const content = await readTextSafe(s);
    if (content === null) { skipped.push(f); continue; }
    manifest[f] = sha256(content);
    if (!opts.dryRun) {
      await writeText(path.join(dst, f), content);
      try { await fs.chmod(path.join(dst, f), 0o755); } catch { /* ok */ }
    }
    installed.push(f);
  }
  return { installed, skipped, location: dst, dry_run: !!opts.dryRun, hash_manifest: manifest };
}

export async function uninstall(projectPath: string, scope: 'baseline' | 'security'): Promise<{ removed: string[]; location: string }> {
  const dst = installDir(projectPath, scope);
  if (!fileExists(dst)) return { removed: [], location: dst };
  let removed: string[] = [];
  try { removed = (await fs.readdir(dst)).filter((f) => f.endsWith('.mjs')); } catch { /* ok */ }
  for (const f of removed) { try { await fs.unlink(path.join(dst, f)); } catch { /* ok */ } }
  try { await fs.rmdir(dst); } catch { /* ok */ }
  return { removed, location: dst };
}

export async function status(projectPath: string): Promise<{ baseline: { installed: string[]; missing: string[]; location: string }; security: { installed: string[]; missing: string[]; location: string }; tampered: string[] }> {
  const out: { baseline: { installed: string[]; missing: string[]; location: string }; security: { installed: string[]; missing: string[]; location: string }; tampered: string[] } = {
    baseline: { installed: [], missing: [], location: installDir(projectPath, 'baseline') },
    security: { installed: [], missing: [], location: installDir(projectPath, 'security') },
    tampered: [],
  };
  for (const [scope, list] of [['baseline', BASELINE_HOOKS], ['security', SECURITY_HOOKS]] as const) {
    const dir = installDir(projectPath, scope);
    let present: string[] = [];
    if (fileExists(dir)) {
      try { present = (await fs.readdir(dir)).filter((f) => f.endsWith('.mjs')); } catch { /* ok */ }
    }
    out[scope].installed = present;
    out[scope].missing = list.filter((f) => !present.includes(f));
  }
  return out;
}
