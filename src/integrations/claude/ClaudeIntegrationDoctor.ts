import { promisify } from 'node:util';
import { exec } from 'node:child_process';
import path from 'node:path';
import { fileExists } from '../../utils/fs.js';
import { status as hooksStatus } from './ClaudeHooksInstaller.js';

const exec_ = promisify(exec);

export interface ClaudeDoctorReport {
  cli_present: boolean;
  cli_version?: string;
  baseline_hooks: { installed: string[]; missing: string[] };
  security_hooks: { installed: string[]; missing: string[] };
  settings_present: boolean;
  remediation: string[];
}

export async function diagnose(projectPath: string): Promise<ClaudeDoctorReport> {
  let cliPresent = false;
  let cliVersion: string | undefined;
  try {
    const r = await exec_('claude --version', { timeout: 3000 });
    cliPresent = true;
    cliVersion = r.stdout.trim();
  } catch { /* not installed */ }
  const st = await hooksStatus(projectPath);
  const settings = fileExists(path.join(projectPath, '.claude', 'settings.json'));
  const remediation: string[] = [];
  if (!cliPresent) remediation.push('Install Claude CLI (https://docs.anthropic.com/claude/docs/claude-code)');
  if (st.security.missing.length > 0) remediation.push(`Install security hooks: pnpm demo2project claude:install-security-hooks --project ${projectPath}`);
  if (!settings) remediation.push(`Generate settings: pnpm demo2project claude:generate-settings --project ${projectPath}`);
  return {
    cli_present: cliPresent,
    cli_version: cliVersion,
    baseline_hooks: { installed: st.baseline.installed, missing: st.baseline.missing },
    security_hooks: { installed: st.security.installed, missing: st.security.missing },
    settings_present: settings,
    remediation,
  };
}
