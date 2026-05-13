import path from 'node:path';
import { promises as fs } from 'node:fs';
import { readJsonSafe } from '../../utils/json.js';
import { ensureDir, fileExists } from '../../utils/fs.js';
import { migrate, needsMigration } from '../config/ConfigMigration.js';
import { CONFIG_SCHEMA_VERSION } from '../config/ConfigSchema.js';
import { ConfigManager } from '../config/ConfigManager.js';
import { append as auditAppend } from '../../governance/audit/AuditLog.js';

export interface MigrationReport {
  generated_at: string;
  dry_run: boolean;
  scope: 'system' | 'project';
  needs_migration: boolean;
  from?: string;
  to?: string;
  steps: string[];
  warnings: string[];
  backup_path?: string;
  applied: boolean;
}

export async function status(systemRoot: string, projectPath?: string): Promise<MigrationReport> {
  const cm = new ConfigManager(systemRoot);
  const target = projectPath ? cm.projectConfigPath(projectPath) : cm.systemConfigPath();
  const raw = await readJsonSafe<unknown>(target);
  // "fresh state" (no file) is not "needs migration"; it just means we'd create defaults.
  const need = raw ? needsMigration(raw) : false;
  return {
    generated_at: new Date().toISOString(),
    dry_run: true,
    scope: projectPath ? 'project' : 'system',
    needs_migration: need,
    from: (raw as { schema_version?: string } | null)?.schema_version,
    to: CONFIG_SCHEMA_VERSION,
    steps: need ? ['will run config:migrate'] : [],
    warnings: fileExists(target) ? [] : ['target config file does not exist; migration will create defaults'],
    applied: false,
  };
}

export async function run(systemRoot: string, projectPath?: string, opts: { dryRun?: boolean } = {}): Promise<MigrationReport> {
  const cm = new ConfigManager(systemRoot);
  const target = projectPath ? cm.projectConfigPath(projectPath) : cm.systemConfigPath();
  const raw = await readJsonSafe<unknown>(target);
  const result = migrate(raw);
  let backup: string | undefined;
  if (!opts.dryRun && fileExists(target)) {
    backup = `${target}.bak-${Date.now()}`;
    await ensureDir(path.dirname(backup));
    try { await fs.copyFile(target, backup); } catch { /* ok */ }
  }
  if (!opts.dryRun) {
    if (projectPath) await cm.saveProject(projectPath, result.migrated);
    else await cm.saveSystem(result.migrated);
    await auditAppend(systemRoot, {
      actor: 'migration_manager',
      action: 'config:migrate',
      target: target,
      decision: 'migrated',
      risk_level: 'medium',
      metadata: { from: result.from, to: result.to, steps: result.steps },
    });
  }
  return {
    generated_at: new Date().toISOString(),
    dry_run: !!opts.dryRun,
    scope: projectPath ? 'project' : 'system',
    needs_migration: result.from !== result.to,
    from: result.from,
    to: result.to,
    steps: result.steps,
    warnings: result.warnings,
    backup_path: backup,
    applied: !opts.dryRun,
  };
}
