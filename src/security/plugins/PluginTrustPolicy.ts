export interface PluginTrustEntry {
  source: string;
  trust: 'trusted' | 'partially_trusted' | 'untrusted';
  reason: string;
}

export const DEFAULT_PLUGIN_TRUST: PluginTrustEntry[] = [
  { source: 'anthropic/*', trust: 'trusted', reason: 'first-party Anthropic plugin' },
  { source: '*', trust: 'untrusted', reason: 'default: unknown plugin source' },
];

export function classifySource(source: string, entries: PluginTrustEntry[] = DEFAULT_PLUGIN_TRUST): PluginTrustEntry {
  for (const e of entries) {
    if (e.source === source) return e;
    if (e.source.endsWith('/*') && source.startsWith(e.source.slice(0, -1))) return e;
    if (e.source === '*') return e;
  }
  return { source, trust: 'untrusted', reason: 'no rule matched' };
}
