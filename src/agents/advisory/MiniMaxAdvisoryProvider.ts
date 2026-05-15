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
      timeoutMs: opts.timeoutMs ?? 300_000,
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
          messages: buildMessages(request),
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        return this.emptyReport(request, [`MiniMax advisory API failed with status ${response.status}`]);
      }
      const json = await response.json();
      const content = extractAssistantText(json);
      const parsed = parseJsonObject(content);
      if (!parsed) {
        return this.emptyReport(request, ['MiniMax advisory output was not parseable JSON']);
      }
      return normalizeAdvisoryReport(parsed, {
        role: request.role,
        provider: this.name,
        model: this.model,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this.emptyReport(request, [`MiniMax advisory error: ${message}`]);
    } finally {
      clearTimeout(timer);
    }
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

function extractAssistantText(json: unknown): string {
  const root = json as { choices?: Array<{ message?: { content?: unknown }; text?: unknown }> };
  const first = root?.choices?.[0];
  const content = first?.message?.content ?? first?.text;
  return typeof content === 'string' ? content : '';
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = stripCodeFence(text.trim());
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function stripCodeFence(text: string): string {
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);
  return match ? match[1]!.trim() : text;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}
