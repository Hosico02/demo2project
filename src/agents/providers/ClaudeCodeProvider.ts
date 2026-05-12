import { spawn } from 'node:child_process';
import type { AgentTask, AgentResult, VerificationResult } from '../../core/types.js';
import type { AgentProvider, AgentContext } from './AgentProvider.js';
import { runCommand } from '../../core/commandRunner.js';
import { summarizeOutput } from '../../core/redaction.js';
import { safeStringify } from '../../utils/json.js';

/**
 * ClaudeCodeProvider — drives a real Claude Code CLI subprocess.
 *
 * Enable via either:
 *   - constructor option `{ enabled: true }`, or
 *   - environment variable `DEMO2PROJECT_CLAUDE_CODE=1`.
 *
 * Protocol:
 *   1. We build a structured prompt from the AgentTask.
 *   2. We invoke `claude -p <prompt> --output-format json --permission-mode acceptEdits`
 *      with cwd = project_path. The `-p` flag is Claude Code's headless
 *      "print" mode; it writes a final JSON object to stdout and exits.
 *   3. We parse the JSON. If it has top-level `changed_files` etc. we use
 *      them; otherwise we synthesize an AgentResult and rely on the
 *      `verification_commands` we run ourselves.
 *   4. We always run the task's verification_commands locally afterwards
 *      so evidence is independent of the model's claims — the executor
 *      contract forbids "trust me" results.
 *
 * Safety:
 *   - Total wall-clock cap via timeoutMs.
 *   - All verification commands go through commandRunner (which enforces
 *     the dangerous-pattern blocklist).
 *   - Output is redacted before being persisted.
 */
export interface ClaudeCodeOptions {
  enabled?: boolean;
  binary?: string;            // override path to `claude`
  timeoutMs?: number;         // total subprocess wall clock
  extraArgs?: string[];       // additional CLI args
  permissionMode?: 'acceptEdits' | 'plan' | 'bypassPermissions' | 'default';
}

export class ClaudeCodeProvider implements AgentProvider {
  readonly name = 'claude-code';
  private opts: Required<ClaudeCodeOptions>;

  constructor(opts: ClaudeCodeOptions = {}) {
    this.opts = {
      enabled: opts.enabled ?? process.env.DEMO2PROJECT_CLAUDE_CODE === '1',
      binary: opts.binary ?? process.env.DEMO2PROJECT_CLAUDE_BIN ?? 'claude',
      timeoutMs: opts.timeoutMs ?? 300_000,
      extraArgs: opts.extraArgs ?? [],
      permissionMode: opts.permissionMode ?? 'acceptEdits',
    };
  }

  async runTask(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
    const base: AgentResult = {
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

    if (!this.opts.enabled) {
      return {
        ...base,
        summary: 'ClaudeCodeProvider not enabled (set DEMO2PROJECT_CLAUDE_CODE=1 or pass enabled:true)',
        unable_to_verify_reason: 'provider_not_enabled',
        risks: ['Real ClaudeCodeProvider not active'],
      };
    }

    const prompt = buildPrompt(task);
    const sub = await invokeClaude(prompt, ctx.project_path, this.opts);

    if (sub.error) {
      return {
        ...base,
        status: 'failed',
        summary: `claude subprocess error: ${sub.error}`,
        failures: [`claude_subprocess_error:${sub.error}`],
      };
    }

    const parsed = parseClaudeJson(sub.stdout);
    const summary = parsed?.summary ?? (parsed?.result as string | undefined) ?? '(no summary from claude)';
    const changed_files = Array.isArray(parsed?.changed_files)
      ? parsed!.changed_files.map(String)
      : [];

    // Always run the task's verification commands locally afterwards.
    const evidence: VerificationResult[] = [];
    for (const cmd of task.verification_commands) {
      const vr = await runCommand(cmd, { cwd: ctx.project_path, timeoutMs: 60_000 });
      evidence.push(vr);
    }
    const allPassed = evidence.length > 0 && evidence.every((e) => e.passed);

    return {
      ...base,
      summary,
      status: changed_files.length > 0 && evidence.length === 0
        ? 'failed'
        : allPassed ? 'completed' : evidence.length === 0 ? 'skipped' : 'failed',
      changed_files,
      commands_run: task.verification_commands,
      verification_evidence: evidence,
      unable_to_verify_reason: evidence.length === 0 && changed_files.length === 0
        ? 'no_verification_commands_for_task'
        : undefined,
      failures: evidence.filter((e) => !e.passed).map((e) => `${e.command} → ${e.failure_reason ?? 'failed'}`),
      next_steps: parsed?.next_steps ?? [],
      risks: parsed?.risks ?? [],
    };
  }
}

// --- helpers -------------------------------------------------------------

interface ClaudeJsonPayload {
  summary?: string;
  result?: string;
  changed_files?: unknown[];
  next_steps?: string[];
  risks?: string[];
}

function parseClaudeJson(stdout: string): ClaudeJsonPayload | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  // Try whole-buffer parse first
  try {
    const obj = JSON.parse(trimmed);
    if (obj && typeof obj === 'object') return obj as ClaudeJsonPayload;
  } catch { /* fallthrough */ }
  // Fallback: take last JSON object on stdout (claude -p sometimes prints lines)
  const m = trimmed.match(/\{[\s\S]*\}\s*$/);
  if (m) {
    try {
      return JSON.parse(m[0]) as ClaudeJsonPayload;
    } catch { /* fallthrough */ }
  }
  return null;
}

function buildPrompt(task: AgentTask): string {
  return [
    'You are an automated code-modification executor inside the demo2project iteration loop.',
    'Apply ONLY the changes required to satisfy this task. Make minimal, focused edits.',
    '',
    `Task: ${task.title}`,
    `Description: ${task.description}`,
    `Acceptance criteria:`,
    ...task.acceptance_criteria.map((c) => `  - ${c}`),
    `Expected changed files: ${task.expected_changed_files.join(', ') || '(unspecified)'}`,
    `Verification commands (will be re-run locally after you finish):`,
    ...task.verification_commands.map((c) => `  - ${c}`),
    '',
    'After making edits, output a final single-line JSON object on the last line of your response in this shape:',
    '{"summary":"<one-line summary>","changed_files":["path/relative/to/project"],"next_steps":[],"risks":[]}',
    '',
    `Raw task JSON (for reference): ${safeStringify(task, 2000)}`,
  ].join('\n');
}

interface SubprocessResult { stdout: string; stderr: string; error?: string }

function invokeClaude(prompt: string, cwd: string, opts: Required<ClaudeCodeOptions>): Promise<SubprocessResult> {
  return new Promise((resolve) => {
    const args = [
      '-p', prompt,
      '--output-format', 'json',
      '--permission-mode', opts.permissionMode,
      ...opts.extraArgs,
    ];
    let stdout = '';
    let stderr = '';
    let child;
    try {
      child = spawn(opts.binary, args, { cwd, env: process.env });
    } catch (err) {
      resolve({ stdout: '', stderr: '', error: `spawn_failed:${String(err)}` });
      return;
    }
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* noop */ }
      resolve({
        stdout: summarizeOutput(stdout),
        stderr: summarizeOutput(stderr),
        error: `timeout_after_${opts.timeoutMs}ms`,
      });
    }, opts.timeoutMs);
    child.stdout.on('data', (d) => { stdout += d.toString(); if (stdout.length > 500_000) stdout = stdout.slice(-500_000); });
    child.stderr.on('data', (d) => { stderr += d.toString(); if (stderr.length > 500_000) stderr = stderr.slice(-500_000); });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, error: `spawn_error:${err.message}` });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        resolve({ stdout, stderr, error: `exit_code_${code}` });
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}
