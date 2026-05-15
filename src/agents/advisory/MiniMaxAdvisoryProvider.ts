import type { AdvisoryReport } from '../../core/types.js';
import type { AdvisoryProvider, AdvisoryRequest } from './AdvisoryProvider.js';
import { normalizeAdvisoryReport } from './AdvisoryProvider.js';
import { safeStringify } from '../../utils/json.js';

export interface MiniMaxAdvisoryProviderOptions {
  enabled?: boolean;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class MiniMaxAdvisoryProvider implements AdvisoryProvider {
  readonly name = 'minimax-advisory';
  readonly model: string;
  private opts: {
    enabled: boolean;
    apiKey?: string;
    baseUrl: string;
    timeoutMs: number;
    fetchImpl: typeof fetch;
  };

  constructor(opts: MiniMaxAdvisoryProviderOptions = {}) {
    const fetchImpl = opts.fetchImpl ?? globalThis.fetch?.bind(globalThis);
    this.model = opts.model ?? process.env.MINIMAX_MODEL ?? 'MiniMax-M2.7-highspeed';
    this.opts = {
      enabled: opts.enabled ?? process.env.DEMO2PROJECT_MINIMAX === '1',
      apiKey: opts.apiKey ?? process.env.MINIMAX_API_KEY ?? process.env.DEMO2PROJECT_MINIMAX_API_KEY,
      baseUrl: trimTrailingSlash(opts.baseUrl ?? process.env.MINIMAX_BASE_URL ?? 'https://api.minimaxi.com/v1'),
      timeoutMs: opts.timeoutMs ?? parsePositiveInt(process.env.MINIMAX_ADVISORY_TIMEOUT_MS ?? process.env.MINIMAX_TIMEOUT_MS ?? process.env.DEMO2PROJECT_MINIMAX_TIMEOUT_MS) ?? 300_000,
      fetchImpl: fetchImpl as typeof fetch,
    };
  }

  async runAdvisory(request: AdvisoryRequest): Promise<AdvisoryReport> {
    if (!this.opts.enabled) {
      return this.emptyReport(request, ['MiniMax advisory provider not enabled']);
    }
    if (!this.opts.apiKey) {
      return this.emptyReport(request, ['MINIMAX_API_KEY is missing']);
    }
    if (!this.opts.fetchImpl) {
      return this.emptyReport(request, ['fetch is unavailable']);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);
    try {
      const messages = buildMessages(request);
      let response = await this.invoke(messages, controller.signal);
      if ('error' in response) return this.fallbackOrEmptyReport(request, [response.error]);
      let content = extractAssistantText(response.json);
      let parsed = parseJsonObject(content);
      if (!parsed) {
        response = await this.invoke(buildRepairMessages(messages, content), controller.signal);
        if ('error' in response) return this.fallbackOrEmptyReport(request, [response.error]);
        content = extractAssistantText(response.json);
        parsed = parseJsonObject(content);
      }
      if (!parsed) {
        return this.fallbackOrEmptyReport(request, ['MiniMax advisory output was not parseable JSON']);
      }
      return normalizeAdvisoryReport(parsed, {
        role: request.role,
        provider: this.name,
        model: this.model,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this.fallbackOrEmptyReport(request, [`MiniMax advisory error: ${message}`]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async invoke(
    messages: Array<{ role: 'system' | 'user'; content: string }>,
    signal: AbortSignal,
  ): Promise<{ json: unknown } | { error: string }> {
    const response = await this.opts.fetchImpl(`${this.opts.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.opts.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        max_tokens: 4096,
        reasoning_split: true,
        messages,
      }),
      signal,
    });
    if (!response.ok) return { error: `MiniMax advisory API failed with status ${response.status}` };
    return { json: await response.json() };
  }

  private emptyReport(request: AdvisoryRequest, risks: string[]): AdvisoryReport {
    return normalizeAdvisoryReport(
      {
        role: request.role,
        provider: this.name,
        model: this.model,
        risks,
        raw_summary: '',
        findings: [],
        task_proposals: [],
      },
      { role: request.role, provider: this.name, model: this.model },
    );
  }

  private fallbackOrEmptyReport(request: AdvisoryRequest, risks: string[]): AdvisoryReport {
    return marketResearchFallbackReport(request, this.name, this.model, risks) ??
      this.emptyReport(request, risks);
  }
}

function buildMessages(request: AdvisoryRequest): Array<{ role: 'system' | 'user'; content: string }> {
  return [
    {
      role: 'system',
      content: [
        'You are a MatrixOmnix advisory agent.',
        'You may research and critique, but you cannot mark a project product-ready.',
        'Return only strict JSON with fields: raw_summary, findings, task_proposals, risks.',
        'Every finding must include confidence and either source_urls or concrete local evidence.',
        'Every task proposal must include verification_commands and source_urls.',
        'Prefer the provided source-cited market_research_report over unsupported assumptions.',
        'Do not include file edits. Do not copy competitor text, code, layouts, names, or brand assets.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: safeStringify({
        role: request.role,
        goal: request.goal,
        allow_network: request.allowNetwork === true,
        project_snapshot: request.snapshot,
        score: request.score,
        gap_findings: request.gap.findings.map((finding) => ({
          category: finding.category,
          severity: finding.severity,
          message: finding.message,
          suggested_fix: finding.suggested_fix,
          related_files: finding.related_files,
        })),
        product_maturity: request.gap.product_maturity,
        market_research_report: request.marketResearch
          ? {
              domain: request.marketResearch.domain,
              confidence: request.marketResearch.confidence,
              copy_policy: request.marketResearch.copy_policy,
              capabilities: request.marketResearch.capabilities.map((capability) => ({
                id: capability.id,
                label: capability.label,
                description: capability.description,
                importance: capability.importance,
                source_urls: capability.source_urls,
              })),
              sources: request.marketResearch.sources.map((source) => ({
                title: source.title,
                url: source.url,
                snippet: source.snippet,
              })),
              risks: request.marketResearch.risks,
            }
          : null,
        current_plan: request.plan?.tasks.map((task) => ({
          title: task.title,
          verification_commands: task.verification_commands,
          expected_changed_files: task.expected_changed_files,
        })),
      }),
    },
  ];
}

function buildRepairMessages(
  originalMessages: Array<{ role: 'system' | 'user'; content: string }>,
  invalidResponse: string,
): Array<{ role: 'system' | 'user'; content: string }> {
  const originalUser = originalMessages.find((message) => message.role === 'user')?.content ?? '';
  return [
    {
      role: 'system',
      content: [
        'You repair a previous MatrixOmnix advisory response into strict JSON.',
        'Return ONLY one JSON object. No markdown, no prose, no comments.',
        'Use exactly these top-level fields: raw_summary, findings, task_proposals, risks.',
        'Every finding must include category, severity, message, why_it_matters, suggested_fix, related_files, confidence, source_urls, evidence.',
        'Every task proposal must include title, description, acceptance_criteria, expected_changed_files, verification_commands, priority, confidence, source_urls.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        'Previous advisory response was not parseable JSON.',
        'Rewrite it as strict JSON for the same advisory request.',
        '',
        `Original advisory request:\n${truncate(originalUser, 12_000)}`,
        '',
        `Invalid advisory response:\n${truncate(invalidResponse, 4_000)}`,
      ].join('\n'),
    },
  ];
}

function extractAssistantText(json: unknown): string {
  const root = json as { choices?: Array<{ message?: { content?: unknown }; text?: unknown }> };
  const first = root?.choices?.[0];
  const content = first?.message?.content ?? first?.text;
  return typeof content === 'string' ? content : '';
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = stripCodeFence(text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim());
  const whole = tryParseJsonObject(trimmed);
  if (whole) return whole;
  try {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    return tryParseJsonObject(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
}

function tryParseJsonObject(candidate: string): Record<string, unknown> | null {
  for (const text of [candidate, repairCommonJsonDrift(candidate)]) {
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch { /* try next */ }
  }
  return null;
}

function repairCommonJsonDrift(candidate: string): string {
  return candidate.replace(/([{\[,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*"\s*:)/g, '$1"$2$3');
}

function marketResearchFallbackReport(
  request: AdvisoryRequest,
  provider: string,
  model: string,
  risks: string[],
): AdvisoryReport | null {
  const research = request.marketResearch;
  const capabilities = research?.capabilities
    .filter((capability) => capability.importance !== 'out_of_scope' && capability.source_urls.length > 0)
    .slice(0, 2) ?? [];
  if (capabilities.length === 0) return null;
  return normalizeAdvisoryReport({
    role: request.role,
    provider,
    model,
    raw_summary: `Fallback advisory derived from source-backed ${research?.domain ?? 'market'} research after MiniMax did not return usable guidance.`,
    risks: [...risks, 'fallback_market_research_advisory_used'],
    findings: capabilities.map((capability) => {
      const expectedFiles = fallbackExpectedFiles(request, capability.id);
      return {
        category: `market_capability_gap_${capability.id}`,
        severity: capability.importance === 'required' ? 'high' : 'medium',
        message: `Missing mature-product capability: ${capability.label}`,
        why_it_matters: capability.description,
        suggested_fix: `Implement the project-specific equivalent of ${capability.label} without copying competitor text, code, layouts, names, or assets.`,
        related_files: expectedFiles,
        confidence: research?.confidence === 'low' ? 'medium' : (research?.confidence ?? 'medium'),
        source_urls: capability.source_urls,
        evidence: capability.local_evidence_patterns.length > 0
          ? capability.local_evidence_patterns.map((pattern) => `local evidence pattern: ${pattern}`)
          : [`market research capability: ${capability.description}`],
      };
    }),
    task_proposals: capabilities.map((capability) => {
      const expectedFiles = fallbackExpectedFiles(request, capability.id);
      const verificationCommands = fallbackVerificationCommands(request, capability.id);
      return {
        title: `Close market capability gap: ${capability.label}`,
        description: [
          `Source-backed market research for ${research?.domain ?? 'this product'} identified this mature-product capability: ${capability.description}`,
          'Implement the equivalent behavior for this project and verify it locally; do not copy competitor expression or assets.',
        ].join(' '),
        acceptance_criteria: [
          `${capability.label} exists as project-specific behavior, not only documentation`,
          'local verification command passes',
          'README or product docs describe how to use and verify the behavior',
        ],
        expected_changed_files: expectedFiles,
        verification_commands: verificationCommands,
        priority: capability.importance === 'required' ? 'high' : 'medium',
        confidence: research?.confidence === 'low' ? 'medium' : (research?.confidence ?? 'medium'),
        source_urls: capability.source_urls,
      };
    }),
  }, { role: request.role, provider, model });
}

function fallbackVerificationCommands(request: AdvisoryRequest, capabilityId?: string): string[] {
  if (isPythonProject(request)) {
    if (capabilityId === 'agent_model_configuration') return ['python3 -m pytest tests/test_llm_config.py -q'];
    if (capabilityId === 'simulation_replay_observability' || capabilityId === 'evaluation_harness') {
      return ['python3 -m pytest tests/test_eval_harness.py tests/test_replay.py -q'];
    }
    if (capabilityId === 'deterministic_rules_and_guardrails') return ['python3 -m pytest -q'];
  }
  const first = request.snapshot.test_commands[0] ?? request.snapshot.build_commands[0];
  if (first) return [first];
  if (isPythonProject(request)) {
    return ['python3 -m pytest -q'];
  }
  if (request.snapshot.detected_language === 'javascript' || request.snapshot.package_manager === 'npm') {
    return ['npm test'];
  }
  return ['test -f README.md'];
}

function fallbackExpectedFiles(request: AdvisoryRequest, capabilityId?: string): string[] {
  if (isPythonProject(request)) {
    if (capabilityId === 'agent_model_configuration') {
      return ['llm_config.py', 'tests/test_llm_config.py', 'app.py', 'player.py', 'game.py', 'templates/index.html'];
    }
    if (capabilityId === 'simulation_replay_observability' || capabilityId === 'evaluation_harness') {
      return ['evaluation.py', 'replay.py', 'tests/test_eval_harness.py', 'tests/test_replay.py', 'docs/agent-evaluation.md', 'README.md', 'package.json'];
    }
    if (capabilityId === 'deterministic_rules_and_guardrails') {
      return ['rules.py', 'tests/test_rules.py', 'docs/game-design.md', 'game.py'];
    }
  }
  const files = request.snapshot.important_files
    .filter((file) => !file.startsWith('.demo2project/'))
    .slice(0, 3);
  return files.length > 0 ? files : ['README.md'];
}

function isPythonProject(request: AdvisoryRequest): boolean {
  return request.snapshot.detected_language === 'python' || request.snapshot.package_manager === 'pip';
}

function stripCodeFence(text: string): string {
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);
  return match ? match[1]!.trim() : text;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n... [truncated, original ${text.length} chars]` : text;
}
