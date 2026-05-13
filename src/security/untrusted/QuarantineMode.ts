import type { TrustRecord } from './RepositoryTrustEvaluator.js';
import { isUntrusted } from './RepositoryTrustEvaluator.js';

const ALLOWED_IN_UNTRUSTED: Set<string> = new Set([
  'file_read',
  'evidence_graph_update',
  'report_export',
]);

const ALLOWED_IN_QUARANTINE: Set<string> = new Set([
  'report_export',
]);

export function isActionAllowed(rec: TrustRecord | null, action: string): { allowed: boolean; reason: string } {
  if (!rec) return { allowed: false, reason: 'no trust record; treating as untrusted' };
  if (rec.trust_level === 'trusted') return { allowed: true, reason: 'trusted repo' };
  if (rec.trust_level === 'partially_trusted') {
    if (ALLOWED_IN_UNTRUSTED.has(action)) return { allowed: true, reason: 'allowed in partially_trusted' };
    return { allowed: false, reason: 'requires elevation; partially_trusted defaults deny' };
  }
  if (rec.trust_level === 'untrusted') {
    if (ALLOWED_IN_UNTRUSTED.has(action)) return { allowed: true, reason: 'allowed in untrusted' };
    return { allowed: false, reason: 'untrusted repo: action blocked' };
  }
  // quarantined
  if (ALLOWED_IN_QUARANTINE.has(action)) return { allowed: true, reason: 'allowed in quarantine' };
  return { allowed: false, reason: 'quarantined repo: blocked' };
}

export function describeAllowedActions(rec: TrustRecord | null): { allowed: string[]; blocked: string[] } {
  if (rec?.trust_level === 'trusted') return { allowed: ['*'], blocked: [] };
  if (rec?.trust_level === 'partially_trusted' || rec?.trust_level === 'untrusted') {
    return { allowed: Array.from(ALLOWED_IN_UNTRUSTED), blocked: ['command_execution', 'network_access', 'dependency_install', 'plugin_installation', 'mcp_server_usage', 'global_memory_update'] };
  }
  return { allowed: Array.from(ALLOWED_IN_QUARANTINE), blocked: ['*'] };
}

void isUntrusted;
