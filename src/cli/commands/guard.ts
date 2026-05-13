import { check as cmdCheck } from '../../security/guards/CommandGuard.js';
import { checkRead, checkWrite } from '../../security/guards/FileAccessGuard.js';
import { describeBlocked } from '../../security/guards/NetworkGuard.js';
import { requireProject, flagString } from './_shared.js';

export async function guardCheckCommand(flags: Record<string, string | boolean>): Promise<number> {
  const command = flagString(flags, 'command');
  if (!command) { process.stderr.write('--command required\n'); return 2; }
  const r = cmdCheck(command);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return r.allowed ? 0 : 1;
}

export async function guardCheckFile(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = requireProject(flags);
  if (!projectPath) return 2;
  const target = flagString(flags, 'path');
  if (!target) { process.stderr.write('--path required\n'); return 2; }
  const mode = flagString(flags, 'mode') ?? 'read';
  const r = mode === 'write' ? checkWrite(projectPath, target) : checkRead(projectPath, target);
  process.stdout.write(JSON.stringify({ mode, ...r }, null, 2) + '\n');
  return r.allowed ? 0 : 1;
}

export async function guardReport(): Promise<number> {
  const net = describeBlocked();
  const report = {
    command_guard: 'active (safety.ts + extended patterns)',
    file_access_guard: 'active (blocks .env, ssh keys, AWS credentials, high-risk Demo2Project paths)',
    network_guard: net,
  };
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  return 0;
}
