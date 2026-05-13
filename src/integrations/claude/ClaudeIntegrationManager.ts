import { install, uninstall, status, BASELINE_HOOKS, SECURITY_HOOKS } from './ClaudeHooksInstaller.js';
import { generate, writeSettings } from './ClaudeSettingsGenerator.js';
import { diagnose } from './ClaudeIntegrationDoctor.js';
import { CLAUDE_PROVIDER_GUIDE } from './ClaudeProviderGuide.js';

export interface SetupReport {
  baseline_install: Awaited<ReturnType<typeof install>>;
  security_install: Awaited<ReturnType<typeof install>>;
  settings_written: string;
  guide: string;
}

export async function setup(systemRoot: string, projectPath: string, opts: { dryRun?: boolean; useSecurityHooks?: boolean } = {}): Promise<SetupReport> {
  const baseline = await install(systemRoot, projectPath, 'baseline', opts);
  const security = opts.useSecurityHooks !== false
    ? await install(systemRoot, projectPath, 'security', opts)
    : { installed: [], skipped: SECURITY_HOOKS, location: '', dry_run: !!opts.dryRun, hash_manifest: {} };
  let settingsPath = '';
  if (!opts.dryRun) {
    settingsPath = await writeSettings(projectPath, generate({ useSecurityHooks: opts.useSecurityHooks !== false }));
  }
  return { baseline_install: baseline, security_install: security, settings_written: settingsPath, guide: CLAUDE_PROVIDER_GUIDE };
}

export { install, uninstall, status, BASELINE_HOOKS, SECURITY_HOOKS, generate, writeSettings, diagnose, CLAUDE_PROVIDER_GUIDE };
