import path from 'node:path';
import type { GapFinding, ProductMaturityAssessment } from './types.js';
import { shortId } from '../utils/time.js';
import { readTextSafe } from '../utils/fs.js';
import type { MarketResearchCapability, MarketResearchReport } from '../research/types.js';

export interface MarketResearchGapResult {
  findings: GapFinding[];
  product_maturity: ProductMaturityAssessment;
}

export async function analyzeMarketResearchGaps(
  projectPath: string,
  files: string[],
  report: MarketResearchReport,
): Promise<MarketResearchGapResult> {
  const sourcedCapabilities = report.capabilities
    .filter((c) => c.importance === 'required' || c.importance === 'recommended')
    .filter((c) => c.source_urls.some((url) => /^https?:\/\//i.test(url)));
  if (sourcedCapabilities.length === 0) {
    return {
      findings: [{
        id: shortId('gap'),
        category: 'market_research_capability_extraction_failed',
        severity: 'high',
        message: 'Market research did not produce any source-cited product capabilities',
        why_it_matters: 'A project must not be marked market-ready when web research found sources but failed to extract concrete, source-backed capabilities to compare against.',
        suggested_fix: 'Refresh research with better queries or improve capability extraction, then rerun gap analysis before allowing market-ready scoring.',
        related_files: ['.demo2project/research/latest.json', '.demo2project/research/latest.md'],
      }],
      product_maturity: {
        domain: report.domain,
        target_market: `source-cited market parity for ${report.domain}`,
        score: 0,
        level: 'demo',
        summary: `Detected 0 source-cited market capabilities from ${report.sources.length} source(s); market parity cannot be assessed.`,
        capabilities: [],
        missing_capabilities: ['Source-cited market capability extraction'],
        references: Array.from(new Set(report.sources.map((source) => source.url).filter((url) => /^https?:\/\//i.test(url)))),
      },
    };
  }
  const implementationText = await readImplementationText(projectPath, files);
  const assessed = sourcedCapabilities.map((cap) => ({
    cap,
    met: capabilityHasLocalEvidence(cap, implementationText),
  }));
  const missingRequired = assessed
    .filter((a) => !a.met && a.cap.importance === 'required')
    .map((a) => a.cap);
  const met = assessed.filter((a) => a.met).length;
  const score = Math.round((met / assessed.length) * 100);
  const product_maturity: ProductMaturityAssessment = {
    domain: report.domain,
    target_market: `source-cited market parity for ${report.domain}`,
    score,
    level: productMaturityLevel(score),
    summary: `Detected ${met}/${assessed.length} source-cited market capabilities in local implementation.`,
    capabilities: assessed.map((a) => ({
      id: a.cap.id,
      label: a.cap.label,
      met: a.met,
      evidence: a.met ? a.cap.local_evidence_patterns : [],
      required_for_market_parity: a.cap.importance === 'required',
    })),
    missing_capabilities: missingRequired.map((c) => c.label),
    references: Array.from(new Set(sourcedCapabilities.flatMap((c) => c.source_urls))),
  };

  const findings: GapFinding[] = [];
  if (missingRequired.length > 0) {
    findings.push({
      id: shortId('gap'),
      category: 'below_market_research_parity',
      severity: 'medium',
      message: `Project is below source-cited market parity: ${missingRequired.map((c) => c.label).slice(0, 5).join(', ')}`,
      why_it_matters: 'A demo can meet internal engineering checks while still missing capabilities that real products in its market consistently expose.',
      suggested_fix: 'Convert the sourced research capabilities into a scoped product roadmap, then implement the highest-impact missing capabilities with verification.',
      related_files: ['.demo2project/research/latest.json', '.demo2project/research/latest.md', 'docs/market-research-roadmap.md'],
    });
  }
  return { findings, product_maturity };
}

async function readImplementationText(projectPath: string, files: string[]): Promise<string> {
  const candidates = files
    .filter((f) =>
      /^(README|package|pyproject|requirements|Dockerfile|wsgi|app|main|server|game|rules|player|config)/i.test(f) ||
      /^(src|app|pages|components|styles|templates|static|server|api|routes|models|services|docs|tests)\//.test(f),
    )
    .filter((f) => /\.(md|json|toml|txt|py|js|mjs|cjs|ts|tsx|jsx|vue|svelte|css|scss|html|yml|yaml)$|Dockerfile$/i.test(f))
    .slice(0, 180);
  const chunks = await Promise.all(candidates.map(async (file) => `${file}\n${(await readTextSafe(path.join(projectPath, file))) ?? ''}`));
  return chunks.join('\n').toLowerCase();
}

function capabilityHasLocalEvidence(cap: MarketResearchCapability, text: string): boolean {
  return cap.local_evidence_patterns.some((pattern) => {
    const needle = pattern.toLowerCase();
    if (!needle) return false;
    return text.includes(needle);
  });
}

function productMaturityLevel(score: number): ProductMaturityAssessment['level'] {
  if (score >= 90) return 'market_ready';
  if (score >= 70) return 'market_parity_candidate';
  if (score >= 50) return 'domain_product_candidate';
  if (score >= 30) return 'engineering_baseline';
  return 'demo';
}
