#!/usr/bin/env node
/**
 * Demo2Project — PostToolUse audit recorder (Phase 7).
 *
 * Appends a redacted audit entry to <project_dir>/.demo2project/audit/hook-audit.jsonl.
 * Cannot break Claude; failures are silent (fail-open).
 */
import { readFileSync, mkdirSync, appendFileSync } from 'node:fs';
import path from 'node:path';

const SECRET_RE = [
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g,
  /\bsk-ant-[A-Za-z0-9_\-]{20,}\b/g,
  /\bsk-[A-Za-z0-9]{30,}\b/g,
];

function redact(s) {
  let out = s;
  for (const re of SECRET_RE) out = out.replace(re, '***REDACTED***');
  return out;
}

try {
  if (process.env.DEMO2PROJECT_HOOKS_DISABLED === '1') process.exit(0);
  const event = JSON.parse(readFileSync(0, 'utf8') || '{}');
  const projectDir = event.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  const dir = path.join(projectDir, '.demo2project', 'audit');
  mkdirSync(dir, { recursive: true });
  const rec = {
    timestamp: new Date().toISOString(),
    tool: event.tool_name ?? '',
    decision: event.tool_response?.is_error ? 'error' : 'ok',
    summary: redact((event.tool_response?.content ?? '').toString().slice(0, 400)),
  };
  appendFileSync(path.join(dir, 'hook-audit.jsonl'), JSON.stringify(rec) + '\n');
} catch { /* fail-open */ }
process.exit(0);
