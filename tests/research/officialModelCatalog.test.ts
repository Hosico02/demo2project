import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  extractOfficialModelIds,
  isOfficialModelSourceUrl,
  loadOfficialModelCatalog,
  refreshOfficialModelCatalog,
  writeOfficialModelCatalog,
} from '../../src/research/OfficialModelCatalog.js';

describe('OfficialModelCatalog', () => {
  it('extracts provider model ids from official docs text and rejects non-official sources', () => {
    expect(isOfficialModelSourceUrl('openai', 'https://platform.openai.com/docs/models')).toBe(true);
    expect(isOfficialModelSourceUrl('openai', 'https://example.com/blog/openai-models')).toBe(false);
    expect(isOfficialModelSourceUrl('minimax', 'https://platform.minimax.io/docs/guides/text-generation')).toBe(true);

    expect(extractOfficialModelIds('openai', 'Use gpt-5.5, gpt-5.4-mini and gpt-5.4-nano for chat.')).toEqual([
      'gpt-5.5',
      'gpt-5.4-mini',
      'gpt-5.4-nano',
    ]);
    expect(extractOfficialModelIds('deepseek', 'Available models: deepseek-v4-flash and deepseek-v4-pro.')).toEqual([
      'deepseek-v4-flash',
      'deepseek-v4-pro',
    ]);
    expect(extractOfficialModelIds('minimax', 'Models: MiniMax-M2.7, MiniMax-M2.7-highspeed.')).toEqual([
      'MiniMax-M2.7',
      'MiniMax-M2.7-highspeed',
    ]);
    expect(extractOfficialModelIds('qwen', 'Model Studio supports qwen3.6-plus, qwen3.6-max-preview and qwen3.5-plus.')).toEqual([
      'qwen3.6-plus',
      'qwen3.6-max-preview',
      'qwen3.5-plus',
    ]);
  });

  it('refreshes a persisted model catalog from official allowlisted docs when web is opted in', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'd2p-official-model-catalog-'));
    const fetched: string[] = [];
    const fetchImpl = async (url: string | URL | Request) => {
      const href = String(url);
      fetched.push(href);
      if (href.includes('openai')) return new Response('Models: gpt-5.5 gpt-5.4 gpt-5.4-mini gpt-5.4-nano');
      if (href.includes('deepseek')) return new Response('Models: deepseek-v4-flash deepseek-v4-pro');
      if (href.includes('minimax')) return new Response('Models: MiniMax-M2.7 MiniMax-M2.7-highspeed');
      if (href.includes('aliyun') || href.includes('alibabacloud')) return new Response('Models: qwen3.6-plus qwen3.6-max-preview qwen3.5-plus');
      return new Response('', { status: 404 });
    };

    const catalog = await refreshOfficialModelCatalog({
      projectPath: dir,
      systemRoot: dir,
      allowNetwork: true,
      fetchImpl,
      generatedAt: new Date(0).toISOString(),
    });
    await writeOfficialModelCatalog(dir, catalog);

    expect(fetched.length).toBeGreaterThanOrEqual(4);
    expect(catalog.providers.find((p) => p.id === 'minimax')?.models).toContain('MiniMax-M2.7');
    expect(catalog.providers.find((p) => p.id === 'openai')?.models).toContain('gpt-5.4-mini');
    expect(catalog.providers.find((p) => p.id === 'qwen')?.source_kind).toBe('live_official_docs');
    expect(catalog.providers.every((p) => p.id === 'custom' || p.source_url.startsWith('https://'))).toBe(true);

    const loaded = await loadOfficialModelCatalog(dir);
    expect(loaded?.providers.find((p) => p.id === 'deepseek')?.models).toContain('deepseek-v4-flash');
    const raw = await readFile(path.join(dir, '.demo2project', 'research', 'llm-model-catalog.json'), 'utf8');
    expect(raw).toContain('live_official_docs');
  });

  it('keeps official model refresh network-denied until --web is explicit', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'd2p-official-model-catalog-denied-'));
    await expect(refreshOfficialModelCatalog({
      projectPath: dir,
      systemRoot: dir,
      allowNetwork: false,
      fetchImpl: async () => new Response('never called'),
      generatedAt: new Date(0).toISOString(),
    })).rejects.toThrow(/network denied|disabled/i);
  });
});
