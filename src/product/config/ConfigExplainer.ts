import type { UnifiedConfig } from './ConfigSchema.js';

export interface ConfigExplanation {
  effective: UnifiedConfig;
  sources: { path: string; source: string }[];
  notes: string[];
}

export function explain(effective: UnifiedConfig, sources: Record<string, string>): ConfigExplanation {
  const entries: { path: string; source: string }[] = [];
  for (const [k, v] of Object.entries(sources)) entries.push({ path: k, source: v });
  const notes: string[] = [];
  if (effective.profile === 'autonomous') notes.push('autonomous profile: long-run allowed, but high-risk actions still require approval');
  if (effective.security.network_default !== 'deny') notes.push('network is not default-deny — review allowlist');
  if (!effective.reports.redact_by_default) notes.push('reports are NOT redacted by default — sensitive data may leak');
  if (effective.privacy.mode === 'normal') notes.push('privacy mode is normal — consider private/strict_private for shared environments');
  return { effective, sources: entries, notes };
}
