import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { analyzeMarketResearchGaps } from '../../src/core/marketGapAnalyzer.js';
import type { MarketResearchReport } from '../../src/research/types.js';

describe('marketGapAnalyzer', () => {
  it('creates market gaps from sourced required capabilities missing in local code', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-market-gap-'));
    await fs.writeFile(path.join(dir, 'README.md'), '# Demo\n\nA small UI demo.\n');
    const report: MarketResearchReport = {
      schema_version: 1,
      generated_at: new Date(0).toISOString(),
      project_path: dir,
      domain: 'web_ui_app',
      query: 'production UI competitors',
      search_provider: 'fixture',
      copy_policy: 'Use competitor material only to extract capabilities; do not copy names, text, UI, code, or brand assets.',
      sources: [
        {
          title: 'Production UI guide',
          url: 'https://example.com/ui',
          retrieved_at: new Date(0).toISOString(),
          snippet: 'Responsive accessible UI with loading and error states.',
        },
      ],
      capabilities: [
        {
          id: 'responsive_accessible_ui',
          label: 'Responsive and accessible UI',
          description: 'Keyboard, touch, responsive layout and semantic labels.',
          importance: 'required',
          source_urls: ['https://example.com/ui'],
          local_evidence_patterns: ['aria-', '@media', 'focus-visible'],
        },
        {
          id: 'unsourced_claim',
          label: 'Unsourced claim',
          description: 'No source means this must not become a requirement.',
          importance: 'required',
          source_urls: [],
          local_evidence_patterns: ['unsourced'],
        },
      ],
      risks: [],
      confidence: 'medium',
    };

    const result = await analyzeMarketResearchGaps(dir, ['README.md'], report);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.category).toBe('below_market_research_parity');
    expect(result.findings[0]?.message).toContain('Responsive and accessible UI');
    expect(result.findings[0]?.message).not.toContain('Unsourced claim');
    expect(result.product_maturity.domain).toBe('web_ui_app');
    expect(result.product_maturity.references).toContain('https://example.com/ui');
    expect(result.product_maturity.missing_capabilities).toContain('Responsive and accessible UI');
  });

  it('fails closed when research sources produce no source-cited capabilities', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-empty-market-gap-'));
    await fs.writeFile(path.join(dir, 'README.md'), '# Werewolf Demo\n\nA small social deduction demo.\n');
    const report: MarketResearchReport = {
      schema_version: 1,
      generated_at: new Date(0).toISOString(),
      project_path: dir,
      domain: 'social_deduction_game',
      query: 'mature online werewolf product competitors',
      search_provider: 'fixture',
      copy_policy: 'Use competitor material only to extract capabilities; do not copy names, text, UI, code, or brand assets.',
      sources: [
        {
          title: 'Competitor landing page',
          url: 'https://example.com/werewolf',
          retrieved_at: new Date(0).toISOString(),
          snippet: 'A mature online social deduction product.',
        },
      ],
      capabilities: [],
      risks: ['Capability extraction returned no product capabilities.'],
      confidence: 'low',
    };

    const result = await analyzeMarketResearchGaps(dir, ['README.md'], report);

    expect(result.product_maturity.score).toBe(0);
    expect(result.product_maturity.level).toBe('demo');
    expect(result.product_maturity.summary).toContain('0 source-cited market capabilities');
    expect(result.findings[0]?.category).toBe('market_research_capability_extraction_failed');
  });
});
