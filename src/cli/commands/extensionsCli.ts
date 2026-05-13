import { ExtensionManager } from '../../extensions/ExtensionManager.js';
import { defaultSystemRoot, flagString } from './_shared.js';

export async function extensionsList(_flags: Record<string, string | boolean>): Promise<number> {
  const m = new ExtensionManager(defaultSystemRoot());
  const list = await m.list();
  process.stdout.write(JSON.stringify({ total: list.length, extensions: list }, null, 2) + '\n');
  return 0;
}

export async function extensionsScan(_flags: Record<string, string | boolean>): Promise<number> {
  const m = new ExtensionManager(defaultSystemRoot());
  const r = await m.scan();
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function extensionsValidate(flags: Record<string, string | boolean>): Promise<number> {
  const dir = flagString(flags, 'path');
  if (!dir) { process.stderr.write('--path required\n'); return 2; }
  const m = new ExtensionManager(defaultSystemRoot());
  const r = await m.validateAt(dir);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return r.valid ? 0 : 1;
}

export async function extensionsSecurityReview(flags: Record<string, string | boolean>): Promise<number> {
  const dir = flagString(flags, 'path');
  if (!dir) { process.stderr.write('--path required\n'); return 2; }
  const m = new ExtensionManager(defaultSystemRoot());
  const r = await m.securityReview(dir);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function extensionsInstall(flags: Record<string, string | boolean>): Promise<number> {
  const dir = flagString(flags, 'path');
  if (!dir) { process.stderr.write('--path required\n'); return 2; }
  const approvalId = flagString(flags, 'approval');
  const m = new ExtensionManager(defaultSystemRoot());
  const r = await m.install(dir, { approvalId });
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return r.installed ? 0 : 1;
}

export async function extensionsDisable(flags: Record<string, string | boolean>): Promise<number> {
  const name = flagString(flags, 'name');
  if (!name) { process.stderr.write('--name required\n'); return 2; }
  const m = new ExtensionManager(defaultSystemRoot());
  const r = await m.disable(name);
  if (!r) { process.stderr.write(`extension ${name} not found\n`); return 1; }
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}
