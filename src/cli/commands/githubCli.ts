import { install, statusOf, explain } from '../../integrations/github/WorkflowInstaller.js';
import { defaultSystemRoot, flagString } from './_shared.js';

export async function githubInstallWorkflows(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = flagString(flags, 'project') ?? process.cwd();
  const dryRun = flags['dry-run'] === true || flags['dry-run'] === 'true';
  const r = await install(defaultSystemRoot(), projectPath, { dryRun });
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function githubWorkflowsStatus(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = flagString(flags, 'project') ?? process.cwd();
  const r = await statusOf(projectPath);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function ciInstall(flags: Record<string, string | boolean>): Promise<number> {
  return githubInstallWorkflows(flags);
}

export async function ciExplain(_flags: Record<string, string | boolean>): Promise<number> {
  process.stdout.write(JSON.stringify(explain(), null, 2) + '\n');
  return 0;
}
