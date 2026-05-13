import path from 'node:path';
import { promises as fs } from 'node:fs';
import { ensureDir, fileExists, readTextSafe, writeText } from '../../utils/fs.js';
import { defaultSystemRoot, flagString } from './_shared.js';

const HOOK_FILES = [
  'pre-tool-use-security-policy.mjs',
  'pre-tool-use-command-guard.mjs',
  'pre-tool-use-file-access-guard.mjs',
  'pre-tool-use-secret-protection.mjs',
  'post-tool-use-audit-recorder.mjs',
  'post-tool-use-evidence-recorder.mjs',
  'stop-verification-and-policy-gate.mjs',
  'stop-incident-check.mjs',
];

function installDir(projectPath: string): string {
  return path.join(projectPath, '.claude', 'hooks', 'demo2project-security');
}

export async function claudeInstallSecurityHooks(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = flagString(flags, 'project') ?? process.cwd();
  const src = path.join(defaultSystemRoot(), 'templates', 'claude', 'hooks');
  const dst = installDir(projectPath);
  await ensureDir(dst);
  const installed: string[] = [];
  for (const f of HOOK_FILES) {
    const s = path.join(src, f);
    if (!fileExists(s)) continue;
    const content = await readTextSafe(s);
    if (content === null) continue;
    await writeText(path.join(dst, f), content);
    await fs.chmod(path.join(dst, f), 0o755).catch(() => {});
    installed.push(f);
  }
  process.stdout.write(JSON.stringify({ installed, location: dst, count: installed.length }, null, 2) + '\n');
  return 0;
}

export async function claudeUninstallSecurityHooks(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = flagString(flags, 'project') ?? process.cwd();
  const dst = installDir(projectPath);
  if (!fileExists(dst)) { process.stdout.write(JSON.stringify({ removed: [], note: 'no install dir' }, null, 2) + '\n'); return 0; }
  let removed: string[] = [];
  try { removed = (await fs.readdir(dst)).filter((f) => f.endsWith('.mjs')); } catch { /* ok */ }
  for (const f of removed) {
    try { await fs.unlink(path.join(dst, f)); } catch { /* ok */ }
  }
  try { await fs.rmdir(dst); } catch { /* ok */ }
  process.stdout.write(JSON.stringify({ removed, location: dst, count: removed.length }, null, 2) + '\n');
  return 0;
}

export async function claudeHooksStatus(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = flagString(flags, 'project') ?? process.cwd();
  const dst = installDir(projectPath);
  let installed: string[] = [];
  if (fileExists(dst)) {
    try { installed = (await fs.readdir(dst)).filter((f) => f.endsWith('.mjs')); } catch { /* ok */ }
  }
  const missing = HOOK_FILES.filter((f) => !installed.includes(f));
  process.stdout.write(JSON.stringify({ location: dst, installed, missing, complete: missing.length === 0 }, null, 2) + '\n');
  return 0;
}
