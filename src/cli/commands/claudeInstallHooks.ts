import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import { writeText, readTextSafe, fileExists, ensureDir } from '../../utils/fs.js';
import { writeJson, readJsonSafe } from '../../utils/json.js';
import { requireProject } from './_shared.js';

/**
 * Copy Demo2Project's Claude Code hook templates into <project>/.claude/.
 *
 * Idempotent. Refuses to overwrite an existing settings.json unless --force.
 * Hooks themselves are always re-copied so they can be updated.
 */
export async function claudeInstallHooks(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const force = flags.force === true || flags.force === 'true';

  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '..', '..', 'templates', 'claude'),
    path.resolve(here, '..', '..', '..', 'templates', 'claude'),
    path.resolve(here, '..', '..', '..', 'dist', 'templates', 'claude'),
  ];
  let templateRoot: string | null = null;
  for (const c of candidates) {
    if (await dirExists(c)) { templateRoot = c; break; }
  }
  if (!templateRoot) {
    process.stderr.write('error: could not locate templates/claude\n');
    return 1;
  }

  const dest = path.join(project, '.claude');
  const destHooks = path.join(dest, 'hooks');
  await ensureDir(destHooks);

  const settingsSrc = path.join(templateRoot, 'settings.json');
  const settingsDst = path.join(dest, 'settings.json');
  let wroteSettings = false;
  if (fileExists(settingsDst) && !force) {
    // Merge: keep user's hooks but append ours under a namespaced key (best-effort)
    const userSettings = await readJsonSafe<{ hooks?: Record<string, unknown> }>(settingsDst);
    const ours = await readJsonSafe<{ hooks?: Record<string, unknown> }>(settingsSrc);
    if (userSettings && ours) {
      const merged = mergeSettings(userSettings, ours);
      await writeJson(settingsDst, merged);
      wroteSettings = true;
    } else {
      process.stderr.write(`note: ${settingsDst} exists; pass --force to overwrite\n`);
    }
  } else {
    const txt = await readTextSafe(settingsSrc);
    if (txt) {
      await writeText(settingsDst, txt);
      wroteSettings = true;
    }
  }

  const hookFiles = ['pre-tool-use-safety.mjs', 'post-tool-use-event-recorder.mjs', 'stop-verification-gate.mjs'];
  let hooksCopied = 0;
  for (const f of hookFiles) {
    const src = path.join(templateRoot, 'hooks', f);
    const dst = path.join(destHooks, f);
    const txt = await readTextSafe(src);
    if (txt) {
      await writeText(dst, txt);
      try { await fs.chmod(dst, 0o755); } catch { /* noop on Windows */ }
      hooksCopied++;
    }
  }

  process.stdout.write(
    JSON.stringify({ project, settings_written: wroteSettings, hooks_copied: hooksCopied, force }, null, 2) + '\n',
  );
  process.stdout.write(
    '\nInstalled. To DISABLE without uninstalling, set:\n  export DEMO2PROJECT_HOOKS_DISABLED=1\n',
  );
  return 0;
}

async function dirExists(p: string): Promise<boolean> {
  try { return (await fs.stat(p)).isDirectory(); } catch { return false; }
}

function mergeSettings(user: Record<string, unknown>, ours: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...user };
  const userHooks = (user.hooks as Record<string, unknown[]> | undefined) ?? {};
  const ourHooks = (ours.hooks as Record<string, unknown[]> | undefined) ?? {};
  const hooks: Record<string, unknown[]> = { ...userHooks };
  for (const k of Object.keys(ourHooks)) {
    const existing = Array.isArray(hooks[k]) ? hooks[k] : [];
    hooks[k] = [...existing, ...(ourHooks[k] ?? [])];
  }
  merged.hooks = hooks;
  return merged;
}
