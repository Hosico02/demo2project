import path from 'node:path';
import { ensureDir } from '../utils/fs.js';
import { readJsonSafe, writeJson } from '../utils/json.js';
import { nowIso } from '../utils/time.js';
import { evaluateResearchUrl, recordIntent } from '../security/guards/NetworkGuard.js';

export type LlmProviderId = 'deepseek' | 'openai' | 'qwen' | 'minimax' | 'custom';
export type OfficialModelSourceKind = 'official_docs_snapshot' | 'live_official_docs' | 'custom';

export interface LlmProviderModelCatalogEntry {
  id: LlmProviderId;
  label: string;
  base_url: string;
  default_model: string;
  models: string[];
  source_url: string;
  source_name: string;
  source_kind: OfficialModelSourceKind;
  retrieved_at: string;
}

export interface OfficialModelCatalog {
  schema_version: 1;
  generated_at: string;
  providers: LlmProviderModelCatalogEntry[];
  warnings: string[];
}

export interface RefreshOfficialModelCatalogOptions {
  projectPath: string;
  systemRoot?: string;
  allowNetwork?: boolean;
  untrusted?: boolean;
  fetchImpl?: typeof fetch;
  generatedAt?: string;
}

export class OfficialModelCatalogNetworkDeniedError extends Error {
  constructor(readonly url: string, readonly reason: string) {
    super(`official model catalog network denied for ${url}: ${reason}`);
  }
}

const OFFICIAL_PROVIDER_DOCS: Record<Exclude<LlmProviderId, 'custom'>, {
  label: string;
  base_url: string;
  default_model: string;
  models: string[];
  source_url: string;
  source_name: string;
  allowlist: RegExp[];
}> = {
  deepseek: {
    label: 'DeepSeek',
    base_url: 'https://api.deepseek.com',
    default_model: 'deepseek-v4-flash',
    models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
    source_url: 'https://api-docs.deepseek.com/api/list-models',
    source_name: 'DeepSeek API official model docs',
    allowlist: [/^https?:\/\/api-docs\.deepseek\.com\//],
  },
  openai: {
    label: 'OpenAI',
    base_url: 'https://api.openai.com/v1',
    default_model: 'gpt-5.4-mini',
    models: ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano'],
    source_url: 'https://platform.openai.com/docs/models',
    source_name: 'OpenAI official model docs',
    allowlist: [
      /^https?:\/\/platform\.openai\.com\/docs\/models/,
      /^https?:\/\/developers\.openai\.com\//,
    ],
  },
  qwen: {
    label: 'Qwen',
    base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    default_model: 'qwen3.6-plus',
    models: ['qwen3.6-plus', 'qwen3.6-max-preview', 'qwen3.6-flash', 'qwen3.5-plus'],
    source_url: 'https://www.alibabacloud.com/help/en/model-studio/text-generation-model',
    source_name: 'Alibaba Cloud Model Studio official model docs',
    allowlist: [
      /^https?:\/\/help\.aliyun\.com\/zh\/(?:model-studio|dashscope)\//,
      /^https?:\/\/www\.alibabacloud\.com\/help\/en\/model-studio\//,
      /^https?:\/\/dashscope\.aliyuncs\.com\//,
    ],
  },
  minimax: {
    label: 'MiniMax',
    base_url: 'https://api.minimax.io/v1',
    default_model: 'MiniMax-M2.7',
    models: ['MiniMax-M2.7', 'MiniMax-M2.7-highspeed', 'MiniMax-M2.5', 'MiniMax-M2.5-highspeed', 'MiniMax-M2.1'],
    source_url: 'https://platform.minimax.io/docs/guides/text-generation',
    source_name: 'MiniMax official model docs',
    allowlist: [
      /^https?:\/\/platform\.minimax\.io\//,
      /^https?:\/\/docs\.minimax\.io\//,
      /^https?:\/\/www\.minimax\.io\//,
    ],
  },
};

const CUSTOM_PROVIDER: Omit<LlmProviderModelCatalogEntry, 'retrieved_at'> = {
  id: 'custom',
  label: 'Custom OpenAI-compatible endpoint',
  base_url: '',
  default_model: '',
  models: [],
  source_url: '',
  source_name: 'User supplied custom endpoint',
  source_kind: 'custom',
};

const PROVIDER_ORDER: LlmProviderId[] = ['deepseek', 'minimax', 'qwen', 'openai', 'custom'];

export function officialModelCatalogPath(projectPath: string): string {
  return path.join(projectPath, '.demo2project', 'research', 'llm-model-catalog.json');
}

export function seedOfficialModelCatalog(generatedAt = nowIso()): OfficialModelCatalog {
  const providers: LlmProviderModelCatalogEntry[] = PROVIDER_ORDER.map((provider) => {
    if (provider === 'custom') {
      return { ...CUSTOM_PROVIDER, retrieved_at: generatedAt };
    }
    const def = OFFICIAL_PROVIDER_DOCS[provider];
    return {
      id: provider,
      label: def.label,
      base_url: def.base_url,
      default_model: def.default_model,
      models: uniqueStrings([def.default_model, ...def.models]),
      source_url: def.source_url,
      source_name: def.source_name,
      source_kind: 'official_docs_snapshot',
      retrieved_at: generatedAt,
    };
  });
  return {
    schema_version: 1,
    generated_at: generatedAt,
    providers,
    warnings: [],
  };
}

export async function refreshOfficialModelCatalog(opts: RefreshOfficialModelCatalogOptions): Promise<OfficialModelCatalog> {
  const generatedAt = opts.generatedAt ?? nowIso();
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const providers: LlmProviderModelCatalogEntry[] = [];
  const warnings: string[] = [];

  for (const provider of PROVIDER_ORDER) {
    if (provider === 'custom') continue;
    const def = OFFICIAL_PROVIDER_DOCS[provider];
    await guardOfficialModelSource({
      url: def.source_url,
      provider,
      systemRoot: opts.systemRoot ?? opts.projectPath,
      allowNetwork: opts.allowNetwork,
      untrusted: opts.untrusted,
    });
    try {
      const response = await fetchImpl(def.source_url, {
        headers: {
          'user-agent': 'MatrixOmnix official model catalog (+https://matrixomnix.vercel.app)',
          accept: 'text/html,application/xhtml+xml,text/plain,application/json',
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      const extracted = extractOfficialModelIds(provider, text);
      const models = prioritizeModels(extracted, def.default_model, def.models);
      providers.push({
        id: provider,
        label: def.label,
        base_url: def.base_url,
        default_model: models.includes(def.default_model) ? def.default_model : models[0] ?? def.default_model,
        models,
        source_url: def.source_url,
        source_name: def.source_name,
        source_kind: extracted.length > 0 ? 'live_official_docs' : 'official_docs_snapshot',
        retrieved_at: generatedAt,
      });
      if (extracted.length === 0) {
        warnings.push(`${provider}: official docs fetched but no model ids were extracted; used snapshot seed models`);
      }
    } catch (err) {
      const seed = seedOfficialModelCatalog(generatedAt).providers.find((entry) => entry.id === provider)!;
      providers.push(seed);
      warnings.push(`${provider}: failed to fetch official model docs (${err instanceof Error ? err.message : String(err)}); used snapshot seed models`);
    }
  }

  providers.push({ ...CUSTOM_PROVIDER, retrieved_at: generatedAt });
  return {
    schema_version: 1,
    generated_at: generatedAt,
    providers: orderProviders(providers),
    warnings,
  };
}

export async function writeOfficialModelCatalog(projectPath: string, catalog: OfficialModelCatalog): Promise<void> {
  const target = officialModelCatalogPath(projectPath);
  await ensureDir(path.dirname(target));
  await writeJson(target, normalizeOfficialModelCatalog(catalog) ?? catalog);
}

export async function loadOfficialModelCatalog(projectPath: string): Promise<OfficialModelCatalog | null> {
  const raw = await readJsonSafe<OfficialModelCatalog>(officialModelCatalogPath(projectPath));
  return normalizeOfficialModelCatalog(raw);
}

export function officialProviderPresetMap(catalog?: OfficialModelCatalog | null, generatedAt = nowIso()): Record<LlmProviderId, LlmProviderModelCatalogEntry> {
  const seed = seedOfficialModelCatalog(generatedAt);
  const byId = new Map<LlmProviderId, LlmProviderModelCatalogEntry>(
    seed.providers.map((provider) => [provider.id, provider]),
  );
  for (const provider of catalog?.providers ?? []) {
    if (!PROVIDER_ORDER.includes(provider.id)) continue;
    if (provider.id !== 'custom' && !isOfficialModelSourceUrl(provider.id, provider.source_url)) continue;
    byId.set(provider.id, {
      ...byId.get(provider.id)!,
      ...provider,
      models: provider.id === 'custom' ? [] : uniqueStrings([provider.default_model, ...provider.models]).filter(Boolean),
    });
  }
  return Object.fromEntries(PROVIDER_ORDER.map((provider) => [provider, byId.get(provider)!])) as Record<LlmProviderId, LlmProviderModelCatalogEntry>;
}

export function isOfficialModelSourceUrl(provider: string, url: string): boolean {
  if (provider === 'custom') return url === '';
  if (!isKnownOfficialProvider(provider)) return false;
  return OFFICIAL_PROVIDER_DOCS[provider].allowlist.some((re) => re.test(url));
}

export function extractOfficialModelIds(provider: string, text: string): string[] {
  if (!isKnownOfficialProvider(provider)) return [];
  const normalized = decodeHtmlEntities(stripTags(text));
  switch (provider) {
    case 'openai':
      return modelMatches(normalized, /\b(?:gpt-(?:[0-9]+(?:\.[0-9]+)?|4o|4\.1|oss)(?:[-.a-z0-9]+)?|o[0-9](?:-[a-z0-9]+)*)\b/gi, normalizeLowerModel);
    case 'deepseek':
      return modelMatches(normalized, /\bdeepseek-[a-z0-9.-]+\b/gi, normalizeLowerModel);
    case 'qwen':
      return modelMatches(normalized, /\bqwen[0-9a-z.:-]*-[0-9a-z.]+(?:-[0-9a-z.]+)*\b/gi, normalizeLowerModel);
    case 'minimax':
      return modelMatches(normalized, /\bMiniMax-M[0-9]+(?:\.[0-9]+)?(?:-[A-Za-z0-9]+)?\b/g, normalizeMiniMaxModel);
    default:
      return [];
  }
}

function normalizeOfficialModelCatalog(raw: OfficialModelCatalog | null): OfficialModelCatalog | null {
  if (!raw || raw.schema_version !== 1 || !Array.isArray(raw.providers)) return null;
  const generatedAt = typeof raw.generated_at === 'string' && raw.generated_at ? raw.generated_at : nowIso();
  const seedMap = officialProviderPresetMap(null, generatedAt);
  const providers: LlmProviderModelCatalogEntry[] = [];
  for (const rawProvider of raw.providers) {
    if (!rawProvider || !PROVIDER_ORDER.includes(rawProvider.id)) continue;
    if (rawProvider.id !== 'custom' && !isOfficialModelSourceUrl(rawProvider.id, rawProvider.source_url)) continue;
    const seed = seedMap[rawProvider.id];
    const models = rawProvider.id === 'custom'
      ? []
      : uniqueStrings([
        safeString(rawProvider.default_model) || seed.default_model,
        ...(Array.isArray(rawProvider.models) ? rawProvider.models.map(safeString) : seed.models),
      ]).filter(Boolean);
    providers.push({
      ...seed,
      label: safeString(rawProvider.label) || seed.label,
      base_url: safeString(rawProvider.base_url) || seed.base_url,
      default_model: rawProvider.id === 'custom' ? '' : (safeString(rawProvider.default_model) || models[0] || seed.default_model),
      models,
      source_url: rawProvider.id === 'custom' ? '' : (safeString(rawProvider.source_url) || seed.source_url),
      source_name: safeString(rawProvider.source_name) || seed.source_name,
      source_kind: normalizeSourceKind(rawProvider.source_kind) ?? seed.source_kind,
      retrieved_at: safeString(rawProvider.retrieved_at) || generatedAt,
    });
  }
  const merged = officialProviderPresetMap({
    schema_version: 1,
    generated_at: generatedAt,
    providers,
    warnings: Array.isArray(raw.warnings) ? raw.warnings.map(safeString).filter(Boolean) : [],
  }, generatedAt);
  return {
    schema_version: 1,
    generated_at: generatedAt,
    providers: PROVIDER_ORDER.map((provider) => merged[provider]),
    warnings: Array.isArray(raw.warnings) ? raw.warnings.map(safeString).filter(Boolean) : [],
  };
}

async function guardOfficialModelSource(opts: {
  url: string;
  provider: Exclude<LlmProviderId, 'custom'>;
  systemRoot: string;
  allowNetwork?: boolean;
  untrusted?: boolean;
}): Promise<void> {
  const decision = evaluateResearchUrl(opts.url, {
    enabled: opts.allowNetwork,
    untrusted: opts.untrusted,
    extraAllowlist: Object.values(OFFICIAL_PROVIDER_DOCS).flatMap((def) => def.allowlist),
  });
  await recordIntent(opts.systemRoot, {
    actor: 'llm-model-catalog-agent',
    url: opts.url,
    method: 'GET',
    intent: `official_model_catalog_refresh:${opts.provider}`,
    allowed: decision.allowed,
    reason: decision.reason,
  });
  if (!decision.allowed) throw new OfficialModelCatalogNetworkDeniedError(opts.url, decision.reason);
}

function modelMatches(text: string, regex: RegExp, normalize: (value: string) => string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(regex)) {
    const raw = match[0] ?? '';
    if (!raw) continue;
    const start = Math.max(0, match.index - 80);
    const end = Math.min(text.length, match.index + raw.length + 80);
    const context = text.slice(start, end);
    if (/\b(deprecated|legacy|retired|sunset)\b/i.test(context)) continue;
    out.push(normalize(raw));
  }
  return uniqueStrings(out).slice(0, 16);
}

function prioritizeModels(extracted: string[], defaultModel: string, seedModels: string[]): string[] {
  const extractedModels = uniqueStrings(extracted).filter(Boolean);
  const source = extractedModels.length > 0 ? extractedModels : seedModels;
  const preferred = extractedModels.includes(defaultModel) || extractedModels.length === 0 ? [defaultModel] : [];
  return uniqueStrings([...preferred, ...source, ...seedModels]).filter(Boolean).slice(0, 16);
}

function orderProviders(providers: LlmProviderModelCatalogEntry[]): LlmProviderModelCatalogEntry[] {
  const byId = new Map(providers.map((provider) => [provider.id, provider]));
  return PROVIDER_ORDER.map((provider) => byId.get(provider)).filter(Boolean) as LlmProviderModelCatalogEntry[];
}

function isKnownOfficialProvider(provider: string): provider is Exclude<LlmProviderId, 'custom'> {
  return provider === 'deepseek' || provider === 'openai' || provider === 'qwen' || provider === 'minimax';
}

function stripTags(text: string): string {
  return text.replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function decodeHtmlEntities(text: string): string {
  return text.replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function normalizeLowerModel(value: string): string {
  return value.toLowerCase().replace(/[.,;:)]+$/, '');
}

function normalizeMiniMaxModel(value: string): string {
  const cleaned = value.replace(/[.,;:)]+$/, '');
  return cleaned.replace(/^minimax/i, 'MiniMax');
}

function uniqueStrings(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const next = String(value ?? '').trim();
    if (!next || seen.has(next)) continue;
    seen.add(next);
    out.push(next);
  }
  return out;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSourceKind(value: unknown): OfficialModelSourceKind | null {
  return value === 'official_docs_snapshot' || value === 'live_official_docs' || value === 'custom' ? value : null;
}
