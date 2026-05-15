import type { ProjectSnapshot } from '../core/types.js';
import type { MarketResearchDomain } from './types.js';

export function inferMarketResearchDomain(snapshot: ProjectSnapshot): MarketResearchDomain {
  const frameworks = new Set(snapshot.detected_frameworks.map((framework) => framework.toLowerCase()));
  const files = snapshot.important_files.join('\n').toLowerCase();
  const all = `${snapshot.detected_language}\n${snapshot.detected_frameworks.join('\n')}\n${files}`;

  if (/werewolf|mafia|social[-_ ]?deduction|lobby|matchmaking/.test(all)) return 'social_deduction_game';
  if (frameworks.has('react') || frameworks.has('vue') || frameworks.has('next') || frameworks.has('svelte') || /\.(vue|tsx|jsx|html)\b/.test(files)) return 'web_ui_app';
  if (frameworks.has('fastapi') || frameworks.has('flask') || frameworks.has('django') || frameworks.has('express') || frameworks.has('fastify') || frameworks.has('nestjs')) return 'api_service';
  if (/cli|bin|command/.test(all)) return 'cli_tool';
  if (/game|scene|sprite|level|canvas|phaser|pixi/.test(all)) return 'game';
  if (/saas|tenant|billing|subscription|dashboard/.test(all)) return 'saas_app';
  return 'generic_product';
}

export function defaultMarketResearchQuery(domain: MarketResearchDomain): string {
  switch (domain) {
    case 'web_ui_app':
      return 'best production web UI product accessibility responsive onboarding patterns';
    case 'social_deduction_game':
      return 'mature online werewolf social deduction game product features matchmaking moderation ranked';
    case 'saas_app':
      return 'mature SaaS product features onboarding auth billing analytics support';
    case 'api_service':
      return 'production API product requirements openapi auth rate limits observability';
    case 'cli_tool':
      return 'production CLI tool requirements install help diagnostics configuration';
    case 'game':
      return 'mature web game product features onboarding progression settings accessibility';
    default:
      return 'mature software product features onboarding verification documentation support';
  }
}
