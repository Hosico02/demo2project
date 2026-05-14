import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AgentTask, AgentResult, IterationEvent, VerificationResult } from '../../core/types.js';
import type { AgentProvider, AgentContext } from './AgentProvider.js';
import { runCommand } from '../../core/commandRunner.js';
import { summarizeOutput } from '../../core/redaction.js';
import { safeStringify } from '../../utils/json.js';

export interface MiniMaxProviderOptions {
  enabled?: boolean;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface MiniMaxEdit {
  path: string;
  content: string;
}

interface MiniMaxJsonPayload {
  summary?: string;
  changed_files?: unknown[];
  edits?: unknown;
  file_edits?: unknown;
  risks?: unknown;
  next_steps?: unknown;
}

/**
 * MiniMaxProvider drives MiniMax M2.7 through its OpenAI-compatible chat API.
 *
 * Unlike CLI-based agents, a raw chat API cannot touch the filesystem. The
 * provider therefore uses a strict JSON edit protocol: MiniMax returns complete
 * file contents for bounded relative paths, then this provider applies them and
 * runs verification locally.
 */
export class MiniMaxProvider implements AgentProvider {
  readonly name = 'minimax';
  private opts: {
    enabled: boolean;
    apiKey?: string;
    baseUrl: string;
    model: string;
    timeoutMs: number;
    fetchImpl: typeof fetch;
  };

  constructor(opts: MiniMaxProviderOptions = {}) {
    const fetchImpl = opts.fetchImpl ?? globalThis.fetch?.bind(globalThis);
    this.opts = {
      enabled: opts.enabled ?? process.env.DEMO2PROJECT_MINIMAX === '1',
      apiKey: opts.apiKey ?? process.env.MINIMAX_API_KEY ?? process.env.DEMO2PROJECT_MINIMAX_API_KEY,
      baseUrl: trimTrailingSlash(opts.baseUrl ?? process.env.MINIMAX_BASE_URL ?? 'https://api.minimaxi.com/v1'),
      model: opts.model ?? process.env.MINIMAX_MODEL ?? 'MiniMax-M2.7',
      timeoutMs: opts.timeoutMs ?? 300_000,
      fetchImpl: fetchImpl as typeof fetch,
    };
  }

  async runTask(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
    const base = baseResult(task);
    if (!this.opts.enabled) {
      return {
        ...base,
        status: 'skipped',
        summary: 'MiniMaxProvider not enabled (set DEMO2PROJECT_MINIMAX=1 or pass enabled:true)',
        unable_to_verify_reason: 'provider_not_enabled',
        risks: ['Real MiniMaxProvider not active'],
      };
    }
    if (!this.opts.apiKey) {
      return {
        ...base,
        status: 'failed',
        summary: 'MiniMaxProvider enabled but MINIMAX_API_KEY is missing',
        unable_to_verify_reason: 'missing_minimax_api_key',
        failures: ['missing_minimax_api_key'],
      };
    }
    if (!this.opts.fetchImpl) {
      return {
        ...base,
        status: 'failed',
        summary: 'MiniMaxProvider cannot run because fetch is unavailable',
        failures: ['fetch_unavailable'],
      };
    }

    const preFiles = await fsFingerprint(ctx.project_path);
    const messages = await buildMessages(task, ctx.project_path, ctx.recent_events);
    let api = await invokeMiniMax(messages, this.opts);
    if (api.error) {
      return {
        ...base,
        status: 'failed',
        summary: `minimax api error: ${api.error}`,
        failures: [`minimax_api_error:${api.error}`],
      };
    }

    let assistantText = extractAssistantText(api.json);
    let parsed = parseMiniMaxJson(assistantText);
    let usedOutputRepairRetry = false;
    if (!parsed) {
      usedOutputRepairRetry = true;
      api = await invokeMiniMax(buildOutputRepairMessages(messages, assistantText), this.opts);
      if (api.error) {
        return {
          ...base,
          status: 'failed',
          summary: `MiniMax output was unparseable and repair retry failed: ${api.error}`,
          unable_to_verify_reason: 'provider_output_unparseable',
          failures: ['provider_output_unparseable', `minimax_repair_api_error:${api.error}`],
          risks: [summarizeOutput(assistantText, 20, 2000)],
        };
      }
      assistantText = extractAssistantText(api.json);
      parsed = parseMiniMaxJson(assistantText);
    }
    if (!parsed) {
      return {
        ...base,
        status: 'failed',
        summary: 'MiniMax response did not contain a parseable JSON edit payload',
        unable_to_verify_reason: 'provider_output_unparseable',
        failures: ['provider_output_unparseable', 'provider_output_repair_unparseable'],
        risks: [summarizeOutput(assistantText, 20, 2000)],
      };
    }

    const edits = normalizeEdits(parsed);
    if (edits.length === 0) {
      return {
        ...base,
        status: 'skipped',
        summary: parsed.summary ?? 'MiniMax returned no edits',
        changed_files: normalizeStringArray(parsed.changed_files),
        unable_to_verify_reason: 'provider_returned_no_edits',
        risks: withRetryRisk(normalizeStringArray(parsed.risks), usedOutputRepairRetry),
        next_steps: normalizeStringArray(parsed.next_steps),
      };
    }

    const applyFailures = await applyEdits(ctx.project_path, edits);
    if (applyFailures.length > 0) {
      return {
        ...base,
        status: 'failed',
        summary: parsed.summary ?? 'MiniMax returned edits, but they were not safe to apply',
        failures: applyFailures,
        risks: withRetryRisk(normalizeStringArray(parsed.risks), usedOutputRepairRetry),
        next_steps: normalizeStringArray(parsed.next_steps),
      };
    }

    const postFiles = await fsFingerprint(ctx.project_path);
    const observed = diffFingerprints(preFiles, postFiles);
    const claimed = normalizeStringArray(parsed.changed_files);
    const changed_files = observed.length > 0 ? observed : claimed;
    const evidence: VerificationResult[] = [];
    for (const cmd of task.verification_commands) {
      evidence.push(await runCommand(cmd, { cwd: ctx.project_path, timeoutMs: 60_000 }));
    }
    const allPassed = evidence.length > 0 && evidence.every((e) => e.passed);

    return {
      ...base,
      status: allPassed ? 'completed' : 'failed',
      summary: parsed.summary ?? `Applied ${edits.length} MiniMax file edit(s)`,
      changed_files,
      commands_run: task.verification_commands,
      verification_evidence: evidence,
      unable_to_verify_reason: evidence.length === 0 ? 'no_verification_commands_for_task' : undefined,
      failures: evidence.filter((e) => !e.passed).map((e) => `${e.command} → ${e.failure_reason ?? 'failed'}`),
      risks: withRetryRisk(normalizeStringArray(parsed.risks), usedOutputRepairRetry),
      next_steps: normalizeStringArray(parsed.next_steps),
    };
  }
}

function baseResult(task: AgentTask): AgentResult {
  return {
    task_id: task.id,
    agent: 'executor',
    status: 'skipped',
    summary: '',
    changed_files: [],
    commands_run: [],
    verification_evidence: [],
    failures: [],
    risks: [],
    next_steps: [],
  };
}

async function invokeMiniMax(
  messages: Array<{ role: 'system' | 'user'; content: string }>,
  opts: { apiKey?: string; baseUrl: string; model: string; timeoutMs: number; fetchImpl: typeof fetch },
): Promise<{ json?: unknown; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await opts.fetchImpl(`${opts.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: opts.model,
        messages,
        temperature: 0.1,
        max_tokens: 8192,
      }),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) return { error: `http_${res.status}:${summarizeOutput(text, 20, 2000)}` };
    try {
      return { json: JSON.parse(text) };
    } catch {
      return { error: `invalid_json_response:${summarizeOutput(text, 20, 2000)}` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: msg === 'This operation was aborted' ? `timeout_after_${opts.timeoutMs}ms` : msg };
  } finally {
    clearTimeout(timer);
  }
}

async function buildMessages(
  task: AgentTask,
  projectPath: string,
  recentEvents: IterationEvent[],
): Promise<Array<{ role: 'system' | 'user'; content: string }>> {
  const files = await listProjectFiles(projectPath, 160);
  const context = await collectContextFiles(projectPath, task.expected_changed_files, recentEvents);
  const recentEvidence = summarizeRecentEvents(recentEvents);
  const system = [
    'You are a code-modification executor inside the demo2project loop.',
    'You cannot call tools. Return complete file edits for this provider to apply.',
    'Return ONLY one JSON object. Do not wrap it in markdown.',
    'Schema: {"summary":"one line","changed_files":["relative/path"],"edits":[{"path":"relative/path","content":"complete new file content"}],"next_steps":[],"risks":[]}',
    'Rules: edit only paths needed for the task, use relative paths inside the project, and include complete file content for each edit.',
  ].join('\n');
  const user = [
    `Task: ${task.title}`,
    `Description: ${task.description}`,
    'Acceptance criteria:',
    ...task.acceptance_criteria.map((c) => `  - ${c}`),
    `Expected changed files: ${task.expected_changed_files.join(', ') || '(unspecified)'}`,
    'Verification commands that will be run locally:',
    ...task.verification_commands.map((c) => `  - ${c}`),
    '',
    `Project files:\n${files.map((f) => `  - ${f}`).join('\n')}`,
    '',
    `Relevant file contents:\n${context}`,
    ...(recentEvidence ? ['', `Recent iteration evidence:\n${recentEvidence}`] : []),
    '',
    `Raw task JSON: ${safeStringify(task, 2000)}`,
  ].join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

function buildOutputRepairMessages(
  originalMessages: Array<{ role: 'system' | 'user'; content: string }>,
  invalidResponse: string,
): Array<{ role: 'system' | 'user'; content: string }> {
  const originalUser = originalMessages.find((m) => m.role === 'user')?.content ?? '';
  return [
    {
      role: 'system',
      content: [
        'You repair a previous MiniMax code-edit response into strict JSON.',
        'Return ONLY one valid JSON object. No markdown, no prose, no comments.',
        'Use this schema exactly: {"summary":"one line","changed_files":["relative/path"],"edits":[{"path":"relative/path","content":"complete new file content"}],"next_steps":[],"risks":[]}',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        'Previous MiniMax response could not be parsed as JSON.',
        'Rewrite it as a valid JSON edit payload for the same task.',
        '',
        `Original task prompt:\n${truncate(originalUser, 12_000)}`,
        '',
        `Invalid response:\n${truncate(invalidResponse, 4_000)}`,
      ].join('\n'),
    },
  ];
}

async function listProjectFiles(root: string, max: number): Promise<string[]> {
  const out: string[] = [];
  const skip = new Set(['.git', 'node_modules', '.venv', '__pycache__', '.demo2project', '.pytest_cache', 'dist', 'coverage']);
  const skipFiles = new Set(['.DS_Store']);
  async function walk(dir: string, rel: string): Promise<void> {
    if (out.length >= max) return;
    let entries: import('node:fs').Dirent[];
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (skip.has(entry.name)) continue;
      const childRel = rel ? path.posix.join(rel, entry.name) : entry.name;
      const childAbs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(childAbs, childRel);
      } else if (entry.isFile() && !skipFiles.has(entry.name)) {
        out.push(childRel);
        if (out.length >= max) return;
      }
    }
  }
  await walk(root, '');
  return out.sort();
}

async function collectContextFiles(root: string, expected: string[], recentEvents: IterationEvent[]): Promise<string> {
  const candidates = new Set([
    ...expected,
    ...pathsFromRecentEvents(recentEvents),
    'README.md',
    'requirements.txt',
    'pyproject.toml',
    '.env.example',
    'app.py',
    'main.py',
    'wsgi.py',
    'tests/test_app.py',
    'tests/test_smoke.py',
    '.github/workflows/ci.yml',
    'Dockerfile',
  ]);
  const chunks: string[] = [];
  for (const rel of candidates) {
    const safe = safeRelPath(root, rel);
    if (!safe.ok) continue;
    try {
      const content = await fs.readFile(safe.abs, 'utf8');
      chunks.push(`--- ${rel} ---\n${truncate(content, 14_000)}`);
    } catch {
      chunks.push(`--- ${rel} ---\n<missing>`);
    }
  }
  return chunks.join('\n\n');
}

function summarizeRecentEvents(events: IterationEvent[]): string {
  const interesting = events
    .filter((e) => e.event_type === 'verification_failed' || e.event_type === 'task_failed' || e.event_type === 'review_finding')
    .slice(-8);
  return interesting.map((e) => {
    const parts = [
      `- ${e.agent}/${e.event_type}: ${e.message}`,
      e.command ? `  command: ${e.command}` : '',
      e.raw_output ? `  output: ${summarizeOutput(e.raw_output, 20, 2500)}` : '',
    ].filter(Boolean);
    return parts.join('\n');
  }).join('\n');
}

function pathsFromRecentEvents(events: IterationEvent[]): string[] {
  const found = new Set<string>();
  const filePattern = /(?:^|[\s("'`])([A-Za-z0-9_./-]+\.(?:py|js|ts|tsx|jsx|json|toml|md|yml|yaml|txt|html|css))(?::\d+)?/gm;
  for (const event of events) {
    const text = [event.message, event.raw_output ?? '', ...(event.files_changed ?? [])].join('\n');
    let match: RegExpExecArray | null;
    while ((match = filePattern.exec(text)) !== null) {
      const rel = match[1]?.replace(/^\.\//, '');
      if (rel && !rel.startsWith('/') && !rel.includes('..')) found.add(rel);
    }
  }
  return Array.from(found);
}

function extractAssistantText(json: unknown): string {
  const obj = json as { choices?: Array<{ message?: { content?: unknown } }> };
  const content = obj.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && 'text' in part) return String((part as { text: unknown }).text);
      return '';
    }).join('');
  }
  return '';
}

function parseMiniMaxJson(text: string): MiniMaxJsonPayload | null {
  const withoutThinking = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const whole = tryParsePayload(withoutThinking);
  if (whole) return whole;
  const fence = withoutThinking.match(/^\s*```(?:json)?\s*([\s\S]*?)```\s*$/i);
  const candidate = fence?.[1]?.trim() ?? withoutThinking;
  if (candidate !== withoutThinking) {
    const fenced = tryParsePayload(candidate);
    if (fenced) return fenced;
  }
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start !== -1 && end > start) {
    const sliced = tryParsePayload(candidate.slice(start, end + 1));
    if (sliced) return sliced;
  }
  return null;
}

function tryParsePayload(candidate: string): MiniMaxJsonPayload | null {
  for (const text of [candidate, repairCommonJsonDrift(candidate)]) {
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' ? parsed as MiniMaxJsonPayload : null;
    } catch { /* try next */ }
  }
  return null;
}

function repairCommonJsonDrift(candidate: string): string {
  return candidate.replace(/([{\[,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*"\s*:)/g, '$1"$2$3');
}

function normalizeEdits(payload: MiniMaxJsonPayload): MiniMaxEdit[] {
  const raw = Array.isArray(payload.edits) ? payload.edits : Array.isArray(payload.file_edits) ? payload.file_edits : [];
  return raw.flatMap((edit) => {
    if (!edit || typeof edit !== 'object') return [];
    const e = edit as { path?: unknown; content?: unknown };
    if (typeof e.path !== 'string' || typeof e.content !== 'string') return [];
    return [{ path: e.path, content: e.content }];
  });
}

async function applyEdits(root: string, edits: MiniMaxEdit[]): Promise<string[]> {
  const failures: string[] = [];
  for (const edit of edits.slice(0, 20)) {
    const safe = safeRelPath(root, edit.path);
    if (!safe.ok) {
      failures.push(`unsafe_edit_path:${edit.path}`);
      continue;
    }
    try {
      await fs.mkdir(path.dirname(safe.abs), { recursive: true });
      await fs.writeFile(safe.abs, edit.content);
    } catch (err) {
      failures.push(`apply_edit_failed:${edit.path}:${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return failures;
}

function safeRelPath(root: string, rel: string): { ok: true; abs: string; rel: string } | { ok: false } {
  if (!rel || rel.includes('\0') || path.isAbsolute(rel)) return { ok: false };
  const normalized = path.posix.normalize(rel.replace(/\\/g, '/'));
  if (normalized === '.' || normalized.startsWith('../') || normalized === '..') return { ok: false };
  const rootAbs = path.resolve(root);
  const abs = path.resolve(rootAbs, normalized);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) return { ok: false };
  return { ok: true, abs, rel: normalized };
}

interface FileFingerprint { rel: string; mtimeMs: number; size: number }

async function fsFingerprint(root: string, max = 1000): Promise<FileFingerprint[]> {
  const out: FileFingerprint[] = [];
  const skip = new Set(['node_modules', '.git', 'dist', '.demo2project', '.pytest_cache', 'coverage', '.venv', '__pycache__']);
  const skipFiles = new Set(['.DS_Store']);
  async function walk(dir: string, rel: string): Promise<void> {
    if (out.length >= max) return;
    let entries: import('node:fs').Dirent[];
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (skip.has(e.name)) continue;
      const childRel = rel ? path.posix.join(rel, e.name) : e.name;
      const childAbs = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(childAbs, childRel);
      } else if (e.isFile() && !skipFiles.has(e.name)) {
        try {
          const st = await fs.stat(childAbs);
          out.push({ rel: childRel, mtimeMs: st.mtimeMs, size: st.size });
        } catch { /* skip */ }
        if (out.length >= max) return;
      }
    }
  }
  await walk(root, '');
  return out;
}

function diffFingerprints(pre: FileFingerprint[], post: FileFingerprint[]): string[] {
  const preMap = new Map(pre.map((f) => [f.rel, f] as const));
  const postMap = new Map(post.map((f) => [f.rel, f] as const));
  const changed = new Set<string>();
  for (const [rel, p] of postMap) {
    const prev = preMap.get(rel);
    if (!prev) changed.add(rel);
    else if (prev.mtimeMs !== p.mtimeMs || prev.size !== p.size) changed.add(rel);
  }
  for (const [rel] of preMap) {
    if (!postMap.has(rel)) changed.add(rel);
  }
  return Array.from(changed).sort();
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function withRetryRisk(risks: string[], usedOutputRepairRetry: boolean): string[] {
  return usedOutputRepairRetry ? [...risks, 'provider_output_repair_retry_used'] : risks;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + `\n... [truncated, original ${text.length} chars]` : text;
}
