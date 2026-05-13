import { ConfigManager } from '../../product/config/ConfigManager.js';
import { diff as configDiff } from '../../product/config/ConfigDiff.js';
import { readJsonSafe } from '../../utils/json.js';
import { defaultSystemRoot, flagString } from './_shared.js';

export async function configShow(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = flagString(flags, 'project');
  const cm = new ConfigManager(defaultSystemRoot());
  const r = await cm.loadEffective(projectPath);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function configExplain(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = flagString(flags, 'project');
  const cm = new ConfigManager(defaultSystemRoot());
  const r = await cm.explainEffective(projectPath);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function configValidate(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = flagString(flags, 'project');
  const cm = new ConfigManager(defaultSystemRoot());
  const r = await cm.validateEffective(projectPath);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return r.ok ? 0 : 1;
}

export async function configMigrate(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = flagString(flags, 'project');
  const cm = new ConfigManager(defaultSystemRoot());
  const r = await cm.migrateConfig(projectPath);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function configDiffCmd(flags: Record<string, string | boolean>): Promise<number> {
  const from = flagString(flags, 'from');
  const to = flagString(flags, 'to');
  if (!from || !to) { process.stderr.write('--from <path> --to <path> required\n'); return 2; }
  const a = await readJsonSafe<unknown>(from);
  const b = await readJsonSafe<unknown>(to);
  const r = configDiff(a, b);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function configExport(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = flagString(flags, 'project');
  const cm = new ConfigManager(defaultSystemRoot());
  const r = await cm.loadEffective(projectPath);
  process.stdout.write(JSON.stringify({ sanitized: cm.exportSanitized(r.config) }, null, 2) + '\n');
  return 0;
}
