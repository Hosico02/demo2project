import { setup, generate, writeSettings, diagnose } from '../../integrations/claude/ClaudeIntegrationManager.js';
import { CLAUDE_PROVIDER_GUIDE } from '../../integrations/claude/ClaudeProviderGuide.js';
import { defaultSystemRoot, flagString } from './_shared.js';

export async function claudeSetup(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = flagString(flags, 'project') ?? process.cwd();
  const dryRun = flags['dry-run'] === true || flags['dry-run'] === 'true';
  const useSecurity = !(flags['no-security'] === true);
  const r = await setup(defaultSystemRoot(), projectPath, { dryRun, useSecurityHooks: useSecurity });
  process.stdout.write(JSON.stringify({ baseline_installed: r.baseline_install.installed, security_installed: r.security_install.installed, settings_written: r.settings_written, dry_run: dryRun }, null, 2) + '\n');
  return 0;
}

export async function claudeDoctor(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = flagString(flags, 'project') ?? process.cwd();
  const r = await diagnose(projectPath);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return r.remediation.length === 0 ? 0 : 1;
}

export async function claudeGenerateSettings(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = flagString(flags, 'project') ?? process.cwd();
  const useSecurity = !(flags['no-security'] === true);
  const settings = generate({ useSecurityHooks: useSecurity });
  const dryRun = flags['dry-run'] === true || flags['dry-run'] === 'true';
  if (dryRun) {
    process.stdout.write(JSON.stringify({ would_write: settings }, null, 2) + '\n');
    return 0;
  }
  const file = await writeSettings(projectPath, settings);
  process.stdout.write(JSON.stringify({ written: file }, null, 2) + '\n');
  return 0;
}

export async function claudeProviderGuideCmd(_flags: Record<string, string | boolean>): Promise<number> {
  process.stdout.write(CLAUDE_PROVIDER_GUIDE + '\n');
  return 0;
}
