import type { UnifiedConfig } from './ConfigSchema.js';
import { CONFIG_SCHEMA_VERSION, DEFAULT_CONFIG } from './ConfigSchema.js';

/**
 * Forward-only migrations. Each step takes a config of an older shape and
 * returns the next shape. Migration is conservative: missing fields fall
 * back to defaults rather than failing.
 */

export interface MigrationResult {
  migrated: UnifiedConfig;
  from: string;
  to: string;
  steps: string[];
  warnings: string[];
}

export function migrate(input: unknown): MigrationResult {
  const steps: string[] = [];
  const warnings: string[] = [];
  let c: Record<string, unknown> = typeof input === 'object' && input !== null ? { ...(input as Record<string, unknown>) } : {};
  const from = String(c.schema_version ?? 'unversioned');
  if (!c.schema_version) {
    steps.push('seed schema_version + defaults');
    c = { ...DEFAULT_CONFIG, ...c, schema_version: CONFIG_SCHEMA_VERSION };
  }
  if (c.schema_version === '0.0.6' || c.schema_version === '0.0.7') {
    steps.push(`bump schema_version to ${CONFIG_SCHEMA_VERSION}`);
    c.schema_version = CONFIG_SCHEMA_VERSION;
    if (!c.privacy) { c.privacy = DEFAULT_CONFIG.privacy; warnings.push('privacy section added with defaults'); }
    if (!c.retention) { c.retention = DEFAULT_CONFIG.retention; warnings.push('retention section added with defaults'); }
    if (!c.reports) { c.reports = DEFAULT_CONFIG.reports; warnings.push('reports section added with defaults'); }
    if (!c.integrations) { c.integrations = DEFAULT_CONFIG.integrations; warnings.push('integrations section added with defaults'); }
    if (!c.extensions) { c.extensions = DEFAULT_CONFIG.extensions; warnings.push('extensions section added with defaults'); }
  }
  const merged: UnifiedConfig = {
    ...DEFAULT_CONFIG,
    ...(c as Partial<UnifiedConfig>),
    autonomy: { ...DEFAULT_CONFIG.autonomy, ...(c.autonomy as object ?? {}) },
    security: { ...DEFAULT_CONFIG.security, ...(c.security as object ?? {}) },
    privacy: { ...DEFAULT_CONFIG.privacy, ...(c.privacy as object ?? {}) },
    retention: { ...DEFAULT_CONFIG.retention, ...(c.retention as object ?? {}) },
    qa: { ...DEFAULT_CONFIG.qa, ...(c.qa as object ?? {}) },
    reports: { ...DEFAULT_CONFIG.reports, ...(c.reports as object ?? {}) },
    integrations: { ...DEFAULT_CONFIG.integrations, ...(c.integrations as object ?? {}) },
    extensions: { ...DEFAULT_CONFIG.extensions, ...(c.extensions as object ?? {}) },
  };
  merged.schema_version = CONFIG_SCHEMA_VERSION;
  return { migrated: merged, from, to: CONFIG_SCHEMA_VERSION, steps, warnings };
}

export function needsMigration(input: unknown): boolean {
  if (!input || typeof input !== 'object') return true;
  const v = (input as { schema_version?: string }).schema_version;
  return v !== CONFIG_SCHEMA_VERSION;
}
