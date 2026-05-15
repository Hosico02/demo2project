import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import {
  runMarketResearch,
  writeMarketResearchReport,
  loadMarketResearchReport,
  deriveCapabilities,
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

  it('extracts social deduction capabilities from sparse mature werewolf search results', () => {
    const capabilities = deriveCapabilities('social_deduction_game', [
      {
        title: 'Wolvesville',
        url: 'https://app.wolvesville.com/',
        snippet: 'Defend your village from the forces of evil or become a werewolf',
      },
      {
        title: 'Wolvesville - Werewolf Online - Apps on Google Play',
        url: 'https://play.google.com/store/apps/details?id=com.werewolfapps.online',
        snippet: 'Join millions of players in the ultimate social deduction game',
      },
      {
        title: 'AI Werewolf Game Online | Play Social Deduction with AI',
        url: 'https://www.werewolvesai.app/',
        snippet: 'Play AI Wolves with autonomous agents and online lobbies',
      },
      {
        title: 'Add Lycantopia Discord Bot',
        url: 'https://top.gg/bot/1493437102166376610',
        snippet: 'The ultimate Werewolf party game bot for Discord communities',
      },
    ]);

    expect(capabilities.map((capability) => capability.id)).toEqual(expect.arrayContaining([
      'lobby_matchmaking',
      'realtime_communication',
      'account_identity',
    ]));
  });

  it('extracts agent-facing werewolf capabilities without forcing human multiplayer assumptions', () => {
    const capabilities = deriveCapabilities('agent_social_deduction_theater', [
      {
        title: 'AI Werewolf Lab',
        url: 'https://example.com/ai-werewolf',
        snippet: 'Multi-agent werewolf benchmark with model provider configuration, replay transcripts and seeded simulation comparison.',
      },
      {
        title: 'LLM Agent Game Evals',
        url: 'https://example.com/agent-game-evals',
        snippet: 'Evaluation harness for repeated social deduction simulations, traces, metrics and prompt guardrails.',
      },
    ]);

    expect(capabilities.map((capability) => capability.id)).toEqual(expect.arrayContaining([
      'agent_model_configuration',
      'simulation_replay_observability',
      'evaluation_harness',
      'deterministic_rules_and_guardrails',
    ]));
    expect(capabilities.map((capability) => capability.id)).not.toContain('account_identity');
    expect(capabilities.map((capability) => capability.id)).not.toContain('lobby_matchmaking');
  });
});
