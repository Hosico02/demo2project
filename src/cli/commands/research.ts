import {
  runMarketResearch,
  writeMarketResearchReport,
} from '../../research/MarketResearchAgent.js';
import { ControlledWebSearchProvider, ResearchNetworkDeniedError } from '../../research/SearchProvider.js';
import type { MarketResearchDomain } from '../../research/types.js';
import { defaultMarketResearchQuery } from '../../research/domainInference.js';
import { flagNumber, flagString, requireProject } from './_shared.js';

const DOMAINS: MarketResearchDomain[] = [
  'web_ui_app',
  'agent_social_deduction_theater',
  'social_deduction_game',
  'saas_app',
  'api_service',
  'cli_tool',
  'game',
  'generic_product',
];

export async function researchCmd(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const domain = parseDomain(flagString(flags, 'domain', 'generic_product')!);
  if (!domain) {
    process.stderr.write(`error: --domain must be one of ${DOMAINS.join(', ')}\n`);
    return 2;
  }
  const allowNetwork = flags.web === true || flags.web === 'true';
  if (!allowNetwork) {
    process.stderr.write('error: research networking is disabled by default; pass --web to run the controlled search provider\n');
    return 2;
  }
  const query = flagString(flags, 'query', defaultMarketResearchQuery(domain))!;
  const maxResults = flagNumber(flags, 'max-results', 8);
  const provider = new ControlledWebSearchProvider({
    systemRoot: project,
    allowNetwork,
  });

  try {
    const report = await runMarketResearch({
      projectPath: project,
      domain,
      query,
      provider,
      maxResults,
    });
    await writeMarketResearchReport(project, report);
    process.stdout.write(JSON.stringify({
      ok: true,
      domain: report.domain,
      query: report.query,
      source_count: report.sources.length,
      capability_count: report.capabilities.length,
      confidence: report.confidence,
      report: '.demo2project/research/latest.json',
      markdown: '.demo2project/research/latest.md',
    }, null, 2) + '\n');
    process.stdout.write('\n>> research report written; run `matrixomnix gap --project <path>` to turn sourced capabilities into gaps\n');
    return 0;
  } catch (err) {
    if (err instanceof ResearchNetworkDeniedError) {
      process.stderr.write(`error: ${err.message}\n`);
      return 2;
    }
    process.stderr.write(`error: research failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}

function parseDomain(raw: string): MarketResearchDomain | null {
  return DOMAINS.includes(raw as MarketResearchDomain) ? raw as MarketResearchDomain : null;
}
