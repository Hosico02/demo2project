#!/usr/bin/env node
/**
 * Demo2Project — PostToolUse event recorder.
 *
 * Records every Bash / Write / Edit / MultiEdit invocation into the project's
 * .demo2project/events/<session>.jsonl with secret redaction and output
 * truncation. Side-effect only: never blocks.
 *
 * Disable: DEMO2PROJECT_HOOKS_DISABLED=1.
 */
import { readFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

if (process.env.DEMO2PROJECT_HOOKS_DISABLED === '1') process.exit(0);

let event;
try {
  event = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  process.exit(0);
}

const projectDir = event.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const sessionId = event.session_id ?? 'claude-session';
const stateDir = path.join(projectDir, '.demo2project', 'events');
try { mkdirSync(stateDir, { recursive: true }); } catch {}

const SECRET_PATTERNS = [
  /(api[_-]?key|secret|token|password|passwd|pwd|access[_-]?key|private[_-]?key|client[_-]?secret|auth|bearer|session[_-]?id|cookie)\s*[:=]\s*[^\s'"]+/gi,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g,
  /\bsk-ant-[A-Za-z0-9_\-]{20,}\b/g,
  /\bsk-[A-Za-z0-9]{20,}\b/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

function redact(t) {
  if (typeof t !== 'string' || !t) return t;
  let out = t;
  for (const re of SECRET_PATTERNS) out = out.replace(re, '***REDACTED***');
  return out;
}

function trunc(t, max = 4000) {
  if (typeof t !== 'string') return t;
  return t.length > max ? t.slice(0, max) + `... [truncated, original ${t.length} chars]` : t;
}

const record = {
  id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
  iteration_id: sessionId,
  timestamp: new Date().toISOString(),
  agent: 'claude-cli',
  event_type: 'command_run',
  severity: 'info',
  message: `tool=${event.tool_name ?? 'unknown'}`,
  command: redact(trunc(event.tool_input?.command ?? '', 500)),
  command_exit_code: event.tool_response?.exit_code,
  files_changed: extractFiles(event),
  raw_output: redact(trunc(combinedOutput(event), 4000)),
  metadata: { tool_name: event.tool_name, hook: 'PostToolUse' },
};

try {
  appendFileSync(path.join(stateDir, `${sessionId}.jsonl`), JSON.stringify(record) + '\n');
} catch {}

process.exit(0);

function extractFiles(ev) {
  const t = ev.tool_name;
  const i = ev.tool_input ?? {};
  if (t === 'Write' || t === 'Edit') return [i.file_path].filter(Boolean);
  if (t === 'MultiEdit') return [i.file_path].filter(Boolean);
  return [];
}
function combinedOutput(ev) {
  const r = ev.tool_response ?? {};
  return [r.stdout, r.stderr, r.output].filter(Boolean).join('\n');
}
