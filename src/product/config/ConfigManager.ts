import path from 'node:path';
import { readJsonSafe, writeJson } from '../../utils/json.js';
import { ensureDir, fileExists } from '../../utils/fs.js';
import { stateDir } from '../../utils/paths.js';
import type { UnifiedConfig } from './ConfigSchema.js';
import { DEFAULT_CONFIG, validate } from './ConfigSchema.js';
import { migrate, needsMigration } from './ConfigMigration.js';
import { applyProfile } from './ConfigProfiles.js';
import type { Profile } from './ConfigSchema.js';
import { explain } from './ConfigExplainer.js';

const PROJECT_CONFIG_FILE = '.demo2project/config.json';
const SYSTEM_CONFIG_FILE = 'config/demo2project.json';

export class ConfigManager {
  constructor(private readonly systemRoot: string) {}

  systemConfigPath(): string { return path.join(this.systemRoot, SYSTEM_CONFIG_FILE); }
  projectConfigPath(projectPath: string): string { return path.join(projectPath, PROJECT_CONFIG_FILE); }

  async loadEffective(projectPath?: string): Promise<{ config: UnifiedConfig; sources: Record<string, string>; warnings: string[] }> {
    const sysRaw = await readJsonSafe<UnifiedConfig>(this.systemConfigPath());
    const projRaw = projectPath ? await readJsonSafe<UnifiedConfig>(this.projectConfigPath(projectPath)) : null;
    const warnings: string[] = [];
    let sys = DEFAULT_CONFIG;
    if (sysRaw) {
      const m = migrate(sysRaw);
      sys = m.migrated;
      warnings.push(...m.warnings.map((w) => `system: ${w}`));
    }
    let effective = sys;
    if (projRaw) {
      const m = migrate(projRaw);
      effective = { ...sys, ...m.migrated, autonomy: { ...sys.autonomy, ...m.migrated.autonomy }, security: { ...sys.security, ...m.migrated.security }, privacy: { ...sys.privacy, ...m.migrated.privacy }, retention: { ...sys.retention, ...m.migrated.retention }, qa: { ...sys.qa, ...m.migrated.qa }, reports: { ...sys.reports, ...m.migrated.reports }, integrations: { ...sys.integrations, ...m.migrated.integrations }, extensions: { ...sys.extensions, ...m.migrated.extensions } };
      warnings.push(...m.warnings.map((w) => `project: ${w}`));
    }
    if (projectPath) effective.project_path = projectPath;
    const sources: Record<string, string> = {};
    for (const k of Object.keys(effective)) {
      sources[k] = projRaw && k in projRaw ? this.projectConfigPath(projectPath!) : sysRaw && k in sysRaw ? this.systemConfigPath() : 'default';
    }
    return { config: effective, sources, warnings };
  }

  async saveSystem(c: UnifiedConfig): Promise<string> {
    await ensureDir(path.dirname(this.systemConfigPath()));
    await writeJson(this.systemConfigPath(), c);
    return this.systemConfigPath();
  }

  async saveProject(projectPath: string, c: UnifiedConfig): Promise<string> {
    const p = this.projectConfigPath(projectPath);
    await ensureDir(path.dirname(p));
    await writeJson(p, c);
    return p;
  }

  async applyProfileToSystem(profile: Profile): Promise<UnifiedConfig> {
    const cur = await this.loadEffective();
    const next = applyProfile(cur.config, profile);
    await this.saveSystem(next);
    return next;
  }

  async validateEffective(projectPath?: string): Promise<ReturnType<typeof validate>> {
    const { config } = await this.loadEffective(projectPath);
    return validate(config);
  }

  async explainEffective(projectPath?: string): Promise<ReturnType<typeof explain>> {
    const { config, sources } = await this.loadEffective(projectPath);
    return explain(config, sources);
  }

  async migrateConfig(projectPath?: string): Promise<{ migrated: UnifiedConfig; from: string; to: string; steps: string[]; warnings: string[]; written_to: string }> {
    const target = projectPath ? this.projectConfigPath(projectPath) : this.systemConfigPath();
    const raw = await readJsonSafe<unknown>(target);
    const m = migrate(raw);
    await ensureDir(path.dirname(target));
    await writeJson(target, m.migrated);
    return { ...m, written_to: target };
  }

  exportSanitized(c: UnifiedConfig): UnifiedConfig {
    // Drop project_path to avoid leaking local paths.
    const out: UnifiedConfig = JSON.parse(JSON.stringify(c));
    delete out.project_path;
    return out;
  }

  async needsMigration(projectPath?: string): Promise<boolean> {
    const target = projectPath ? this.projectConfigPath(projectPath) : this.systemConfigPath();
    if (!fileExists(target)) return false;
    const raw = await readJsonSafe<unknown>(target);
    return needsMigration(raw);
  }
}

void stateDir;
