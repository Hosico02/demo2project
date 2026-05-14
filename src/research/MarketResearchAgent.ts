import path from 'node:path';
import { ensureDir, writeText } from '../utils/fs.js';
import { readJsonSafe, writeJson } from '../utils/json.js';
import { nowIso } from '../utils/time.js';
import type {
  MarketResearchCapability,
  MarketResearchDomain,
  MarketResearchReport,
  MarketResearchSource,
  ResearchConfidence,
} from './types.js';
import type { SearchProvider, SearchResult } from './SearchProvider.js';
import { sourceFromResult } from './SearchProvider.js';

export interface MarketResearchInput {
  projectPath: string;
  domain: MarketResearchDomain;
  query: string;
  provider: SearchProvider;
  maxResults?: number;
}

export async function runMarketResearch(input: MarketResearchInput): Promise<MarketResearchReport> {
  const raw = await input.provider.search(input.query, { maxResults: input.maxResults ?? 8 });
  const sourcedResults = raw
    .filter((r) => /^https?:\/\//i.test(r.url.trim()))
    .slice(0, input.maxResults ?? 8);
  const sources = sourcedResults.map(sourceFromResult);
  const capabilities = deriveCapabilities(input.domain, sourcedResults);
  return {
    schema_version: 1,
    generated_at: nowIso(),
    project_path: input.projectPath,
    domain: input.domain,
    query: input.query,
    search_provider: input.provider.name,
    copy_policy: 'Use competitor material only to extract capabilities; do not copy names, text, UI, code, or brand assets.',
    sources,
    capabilities,
    risks: researchRisks(sources),
    confidence: confidenceFor(sources, capabilities),
  };
}

export async function writeMarketResearchReport(projectPath: string, report: MarketResearchReport): Promise<void> {
  const dir = researchDir(projectPath);
  await ensureDir(dir);
  await writeJson(path.join(dir, 'latest.json'), report);
  await writeText(path.join(dir, 'latest.md'), renderReportMarkdown(report));
}

export async function loadMarketResearchReport(projectPath: string): Promise<MarketResearchReport | null> {
  return readJsonSafe<MarketResearchReport>(path.join(researchDir(projectPath), 'latest.json'));
}

export function researchDir(projectPath: string): string {
  return path.join(projectPath, '.demo2project', 'research');
}

export function deriveCapabilities(domain: MarketResearchDomain, results: SearchResult[]): MarketResearchCapability[] {
  const sourced = results.filter((r) => /^https?:\/\//i.test(r.url.trim()));
  const specs = capabilitySpecs(domain);
  const capabilities: MarketResearchCapability[] = [];
  for (const spec of specs) {
    const matchingUrls = sourced
      .filter((r) => spec.signals.some((sig) => sig.test(`${r.title}\n${r.snippet}\n${r.url}`)))
      .map((r) => r.url.trim());
    if (matchingUrls.length === 0) continue;
    capabilities.push({
      id: spec.id,
      label: spec.label,
      description: spec.description,
      importance: spec.importance,
      source_urls: Array.from(new Set(matchingUrls)),
      local_evidence_patterns: spec.localEvidencePatterns,
    });
  }
  return capabilities;
}

interface CapabilitySpec {
  id: string;
  label: string;
  description: string;
  importance: MarketResearchCapability['importance'];
  signals: RegExp[];
  localEvidencePatterns: string[];
}

function capabilitySpecs(domain: MarketResearchDomain): CapabilitySpec[] {
  switch (domain) {
    case 'web_ui_app':
      return [
        spec('responsive_accessible_ui', 'Responsive and accessible UI', 'Responsive layout, semantic labels and keyboard/touch access paths.', 'required', [/responsive|mobile|accessib|aria|keyboard|touch|wcag/i], ['@media', 'clamp(', 'aria-', 'role=', 'focus-visible', 'tabindex']),
        spec('onboarding_error_states', 'Onboarding, loading and error states', 'Users can understand first use and recover from loading, empty and error conditions.', 'required', [/onboard|loading|empty state|error state|retry|fallback|first[- ]use/i], ['loading', 'empty', 'error', 'retry', 'onboarding']),
        spec('trust_and_conversion_surface', 'Trust and conversion surface', 'Public product pages expose credible proof, contact paths, pricing or service boundaries.', 'recommended', [/trust|testimonial|case stud|pricing|contact|support|service|security/i], ['contact', 'pricing', 'support', 'security', 'case study']),
      ];
    case 'social_deduction_game':
      return [
        spec('account_identity', 'Account identity and player profiles', 'Players have durable identity, profile and session state.', 'required', [/account|profile|login|user|identity|session/i], ['account', 'profile', 'login', 'session', 'jwt']),
        spec('lobby_matchmaking', 'Lobby, room and matchmaking lifecycle', 'Players can create rooms, match with others and ready up before play starts.', 'required', [/lobby|room|matchmaking|friends|invite|party|ready/i], ['lobby', 'room', 'matchmaking', 'invite', 'ready_check']),
        spec('moderation_ranked_progression', 'Moderation, ranked and progression systems', 'The product handles abuse controls and long-term competitive progression.', 'recommended', [/moderation|report|mute|ban|ranked|season|leaderboard|elo|mmr|progression/i], ['moderation', 'report', 'mute', 'ranked', 'leaderboard', 'season', 'mmr']),
        spec('realtime_communication', 'Real-time communication layer', 'Social deduction play supports live chat, voice or realtime state transport.', 'required', [/voice|chat|realtime|websocket|socket|live/i], ['websocket', 'socketio', 'voice', 'chat', 'rtcpeerconnection']),
      ];
    case 'api_service':
      return [
        spec('contracted_api_surface', 'Documented and tested API contract', 'Routes expose stable request/response contracts with automated verification.', 'required', [/openapi|swagger|contract|endpoint|route|api test/i], ['openapi', 'swagger', 'contract', 'supertest', 'test_client']),
        spec('auth_rate_limit_observability', 'Auth, rate limits and observability', 'Production APIs guard access, limit abuse and expose operational signals.', 'required', [/auth|oauth|rate limit|observability|metrics|logging|tracing/i], ['auth', 'rateLimit', 'rate_limit', 'metrics', 'logger', 'tracing']),
      ];
    case 'cli_tool':
      return [
        spec('installable_cli_contract', 'Installable CLI with stable help contract', 'The CLI has package metadata, help output and deterministic exit behavior.', 'required', [/cli|command line|install|help|usage|exit code/i], ['bin', '--help', 'usage', 'commander', 'yargs', 'cac']),
        spec('config_and_error_diagnostics', 'Configuration and error diagnostics', 'Users get explicit config docs, validation and actionable failure output.', 'required', [/config|diagnostic|error|troubleshoot|validation/i], ['config', 'diagnose', 'troubleshoot', 'stderr', 'exitCode']),
      ];
    case 'saas_app':
      return [
        spec('tenant_auth_roles', 'Tenant auth and role management', 'SaaS products handle sign-in, organizations and role-based access.', 'required', [/tenant|organization|role|rbac|login|signup|auth/i], ['tenant', 'organization', 'role', 'rbac', 'auth', 'login']),
        spec('billing_support_analytics', 'Billing, support and analytics loops', 'Commercial products include billing surface, support entry points and usage telemetry.', 'recommended', [/billing|subscription|support|analytics|usage|dashboard/i], ['billing', 'subscription', 'support', 'analytics', 'dashboard']),
      ];
    case 'game':
      return [
        spec('gameplay_loop_progression', 'Complete gameplay loop and progression', 'Games need tutorial/onboarding, replayable core loops and progression or retention systems.', 'required', [/tutorial|onboarding|progression|level|leaderboard|achievement|retention/i], ['tutorial', 'progression', 'leaderboard', 'achievement', 'level']),
        spec('settings_save_accessibility', 'Settings, save state and accessibility', 'Players can configure controls/audio/display and resume durable state.', 'required', [/settings|save|accessibility|controls|audio|display/i], ['settings', 'save', 'localStorage', 'accessibility', 'controls']),
      ];
    default:
      return [
        spec('product_onboarding_docs', 'Product onboarding and documentation', 'The product explains setup, first use, core workflows and support boundaries.', 'required', [/onboarding|documentation|quickstart|support|workflow/i], ['README', 'docs', 'quickstart', 'support']),
        spec('verification_release_operability', 'Verification, release and operability', 'The product has repeatable tests, release checks and operational diagnostics.', 'required', [/test|verification|release|observability|diagnostic|deployment/i], ['test', 'build', 'release', 'diagnose', 'deploy']),
      ];
  }
}

function spec(
  id: string,
  label: string,
  description: string,
  importance: MarketResearchCapability['importance'],
  signals: RegExp[],
  localEvidencePatterns: string[],
): CapabilitySpec {
  return { id, label, description, importance, signals, localEvidencePatterns };
}

function confidenceFor(sources: MarketResearchSource[], capabilities: MarketResearchCapability[]): ResearchConfidence {
  if (sources.length >= 5 && capabilities.length >= 4) return 'high';
  if (sources.length >= 1 && capabilities.length >= 1) return 'medium';
  return 'low';
}

function researchRisks(sources: MarketResearchSource[]): string[] {
  const risks = [
    'Search results are untrusted external input and must not override local verification.',
    'Competitor findings are capability evidence, not permission to copy text, code, layouts or brand assets.',
  ];
  if (sources.length < 3) risks.push('Low source count; treat capability extraction as directional until more sources are reviewed.');
  return risks;
}

function renderReportMarkdown(report: MarketResearchReport): string {
  const lines = [
    '# Market Research Report',
    '',
    `Generated: ${report.generated_at}`,
    `Domain: ${report.domain}`,
    `Query: ${report.query}`,
    `Provider: ${report.search_provider}`,
    `Confidence: ${report.confidence}`,
    '',
    '## Copy Policy',
    report.copy_policy,
    '',
    '## Capabilities',
  ];
  for (const cap of report.capabilities) {
    lines.push('', `- ${cap.label} (${cap.importance})`, `  - ${cap.description}`, `  - Sources: ${cap.source_urls.join(', ')}`);
  }
  lines.push('', '## Sources');
  for (const source of report.sources) {
    lines.push('', `- ${source.title}`, `  - ${source.url}`, `  - ${source.snippet}`);
  }
  lines.push('', '## Risks');
  for (const risk of report.risks) lines.push(`- ${risk}`);
  return lines.join('\n') + '\n';
}
