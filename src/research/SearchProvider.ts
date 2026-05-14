import { evaluateResearchUrl, recordIntent, type ResearchNetworkOptions } from '../security/guards/NetworkGuard.js';
import { nowIso } from '../utils/time.js';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchOptions {
  maxResults?: number;
}

export interface SearchProvider {
  name: string;
  search(query: string, opts?: SearchOptions): Promise<SearchResult[]>;
}

export interface ControlledWebSearchProviderOptions {
  systemRoot: string;
  allowNetwork?: boolean;
  untrusted?: boolean;
  fetchImpl?: typeof fetch;
  endpoint?: 'duckduckgo-html';
  extraAllowlist?: RegExp[];
}

export class ResearchNetworkDeniedError extends Error {
  constructor(readonly url: string, readonly reason: string) {
    super(`research network denied for ${url}: ${reason}`);
  }
}

export class ControlledWebSearchProvider implements SearchProvider {
  readonly name = 'duckduckgo-html';
  private fetchImpl: typeof fetch;

  constructor(private opts: ControlledWebSearchProviderOptions) {
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async search(query: string, opts: SearchOptions = {}): Promise<SearchResult[]> {
    const maxResults = Math.max(1, Math.min(opts.maxResults ?? 8, 12));
    const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    await this.guard(url);
    const res = await this.fetchImpl(url, {
      headers: {
        'user-agent': 'MatrixOmnix research harness (+https://matrixomnix.vercel.app)',
        accept: 'text/html,application/xhtml+xml',
      },
    });
    const text = await res.text();
    return parseDuckDuckGoHtml(text).slice(0, maxResults);
  }

  private async guard(url: string): Promise<void> {
    const policy: ResearchNetworkOptions = {
      enabled: this.opts.allowNetwork,
      untrusted: this.opts.untrusted,
      extraAllowlist: this.opts.extraAllowlist,
    };
    const decision = evaluateResearchUrl(url, policy);
    await recordIntent(this.opts.systemRoot, {
      actor: 'market-research-agent',
      url,
      method: 'GET',
      intent: 'competitor_search',
      allowed: decision.allowed,
      reason: decision.reason,
    });
    if (!decision.allowed) throw new ResearchNetworkDeniedError(url, decision.reason);
  }
}

export function parseDuckDuckGoHtml(html: string): SearchResult[] {
  const out: SearchResult[] = [];
  const blocks = html.split(/result__body|web-result|result-link/gi);
  for (const block of blocks) {
    const hrefMatch = block.match(/href=["']([^"']+)["'][^>]*>([\s\S]{0,400}?)<\/a>/i);
    if (!hrefMatch) continue;
    const rawUrl = decodeHtml(hrefMatch[1] ?? '').trim();
    const title = stripTags(decodeHtml(hrefMatch[2] ?? '')).trim();
    if (!rawUrl || !title) continue;
    const snippetMatch = block.match(/(?:result__snippet|snippet)[^>]*>([\s\S]{0,800}?)<\/[^>]+>/i);
    const snippet = snippetMatch ? stripTags(decodeHtml(snippetMatch[1] ?? '')).trim() : '';
    const url = normalizeDuckDuckGoUrl(rawUrl);
    if (!/^https?:\/\//i.test(url)) continue;
    out.push({ title, url, snippet });
  }
  return dedupeResults(out);
}

function normalizeDuckDuckGoUrl(raw: string): string {
  try {
    const url = new URL(raw, 'https://duckduckgo.com');
    const uddg = url.searchParams.get('uddg');
    return uddg ? decodeURIComponent(uddg) : url.href;
  } catch {
    return raw;
  }
}

function stripTags(text: string): string {
  return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function dedupeResults(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  const out: SearchResult[] = [];
  for (const r of results) {
    if (seen.has(r.url)) continue;
    seen.add(r.url);
    out.push(r);
  }
  return out;
}

export function sourceFromResult(result: SearchResult) {
  return {
    title: result.title.trim(),
    url: result.url.trim(),
    retrieved_at: nowIso(),
    snippet: result.snippet.trim(),
  };
}
