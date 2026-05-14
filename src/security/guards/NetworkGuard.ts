import path from 'node:path';
import { appendText, ensureDir } from '../../utils/fs.js';
import { stateDir } from '../../utils/paths.js';
import { nowIso, shortId } from '../../utils/time.js';
import { redact } from '../../core/redaction.js';

export interface NetworkIntent {
  id: string;
  timestamp: string;
  actor: string;
  url: string;
  method: string;
  intent: string;
  allowed: boolean;
  reason: string;
}

const ALLOWLIST: RegExp[] = [
  /^https?:\/\/(registry\.npmjs\.org|pypi\.org|files\.pythonhosted\.org)\//,
  /^https?:\/\/(github\.com|api\.github\.com)\//,
];

const RESEARCH_ALLOWLIST: RegExp[] = [
  /^https?:\/\/duckduckgo\.com\/html\/?/,
  /^https?:\/\/lite\.duckduckgo\.com\/lite\/?/,
  /^https?:\/\/api\.search\.brave\.com\//,
  /^https?:\/\/serpapi\.com\//,
  /^https?:\/\/www\.googleapis\.com\/customsearch\//,
];

export interface ResearchNetworkOptions {
  enabled?: boolean;
  untrusted?: boolean;
  extraAllowlist?: RegExp[];
}

export function evaluateUrl(url: string, untrusted = false): { allowed: boolean; reason: string } {
  if (untrusted) return { allowed: false, reason: 'untrusted repo: network denied' };
  if (ALLOWLIST.some((re) => re.test(url))) return { allowed: true, reason: 'allowlist match' };
  return { allowed: false, reason: 'not on default allowlist; require approval' };
}

export function evaluateResearchUrl(url: string, opts: ResearchNetworkOptions = {}): { allowed: boolean; reason: string } {
  if (opts.untrusted) return { allowed: false, reason: 'untrusted repo: research network denied' };
  if (!opts.enabled) return { allowed: false, reason: 'research network disabled; pass an explicit opt-in' };
  const allowlist = [...RESEARCH_ALLOWLIST, ...(opts.extraAllowlist ?? [])];
  if (allowlist.some((re) => re.test(url))) return { allowed: true, reason: 'research allowlist match' };
  return { allowed: false, reason: 'not on research allowlist' };
}

export async function recordIntent(systemRoot: string, intent: Omit<NetworkIntent, 'id' | 'timestamp'>): Promise<NetworkIntent> {
  const rec: NetworkIntent = { id: shortId('net'), timestamp: nowIso(), ...intent, url: redact(intent.url) };
  const dir = path.join(systemRoot, '.demo2project', 'network');
  await ensureDir(dir);
  await appendText(path.join(dir, 'intents.jsonl'), JSON.stringify(rec) + '\n');
  return rec;
}

export function describeBlocked(): { allowed_default: string[]; denied_default: string } {
  return {
    allowed_default: ['npm registry', 'pypi', 'github.com (via approval)'],
    denied_default: 'arbitrary outbound URL; untrusted repo denied entirely',
  };
}

void stateDir;
