import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import {
  runMarketResearch,
  writeMarketResearchReport,
  loadMarketResearchReport,
} from '../../src/research/MarketResearchAgent.js';
import type { SearchProvider } from '../../src/research/SearchProvider.js';

describe('MarketResearchAgent', () => {
  it('turns sourced competitor search results into capability evidence', async () => {
    const provider: SearchProvider = {
      name: 'test-search',
      async search() {
        return [
          {
            title: 'Modern SaaS UI checklist',
            url: 'https://example.com/saas-ui',
            snippet: 'Production SaaS pages emphasize responsive layouts, accessible navigation, onboarding, error states and trust signals.',
          },
          {
            title: 'Unsourced marketing claim',
            url: '',
            snippet: 'Every mature product needs quantum delight.',
          },
        ];
      },
    };

    const report = await runMarketResearch({
      projectPath: '/tmp/demo',
      domain: 'web_ui_app',
      query: 'best production web UI product patterns',
      provider,
      maxResults: 5,
    });

    expect(report.search_provider).toBe('test-search');
    expect(report.sources).toHaveLength(1);
    expect(report.capabilities.map((c) => c.id)).toContain('responsive_accessible_ui');
    expect(report.capabilities.map((c) => c.id)).toContain('onboarding_error_states');
    expect(report.capabilities.every((c) => c.source_urls.length > 0)).toBe(true);
    expect(report.capabilities.map((c) => c.label).join('\n')).not.toMatch(/quantum/i);
    expect(report.copy_policy).toContain('extract capabilities');
  });

  it('persists research reports under the project evidence directory', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-market-research-'));
    const provider: SearchProvider = {
      name: 'fixture',
      async search() {
        return [
          {
            title: 'Social game benchmark',
            url: 'https://example.com/social-game',
            snippet: 'Mature social deduction games include accounts, lobbies, matchmaking, moderation and ranked progression.',
          },
        ];
      },
    };

    const report = await runMarketResearch({
      projectPath: dir,
      domain: 'social_deduction_game',
      query: 'mature werewolf social deduction product capabilities',
      provider,
    });
    await writeMarketResearchReport(dir, report);

    const jsonPath = path.join(dir, '.demo2project', 'research', 'latest.json');
    const mdPath = path.join(dir, '.demo2project', 'research', 'latest.md');
    await expect(fs.stat(jsonPath)).resolves.toBeTruthy();
    await expect(fs.stat(mdPath)).resolves.toBeTruthy();
    const loaded = await loadMarketResearchReport(dir);

    expect(loaded?.domain).toBe('social_deduction_game');
    expect(loaded?.capabilities.map((c) => c.id)).toContain('lobby_matchmaking');
  });
});
