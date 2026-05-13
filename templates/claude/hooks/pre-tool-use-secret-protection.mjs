#!/usr/bin/env node
/**
 * Demo2Project — Secret protection hook (Phase 7).
 *
 * Scans command and tool_input fields for embedded secrets (AKIA keys,
 * sk-..., GitHub tokens, JWT, PEM). Blocks if found.
 */
import { readFileSync } from 'node:fs';

function block(reason) {
  process.stderr.write(`[demo2project] SECRET PROTECTION: ${reason}\n`);
  process.exit(2);
}

const PATTERNS = [
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/, 'GitHub token'],
  [/\bsk-ant-[A-Za-z0-9_\-]{20,}\b/, 'Anthropic key'],
  [/\bsk-[A-Za-z0-9]{30,}\b/, 'OpenAI-style key'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/\beyJ[A-Za-z0-9_\-]+\.eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\b/, 'JWT'],
];

function main() {
  if (process.env.DEMO2PROJECT_HOOKS_DISABLED === '1') return;
  let event;
  try { event = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { return; }
  const blob = JSON.stringify(event.tool_input ?? {});
  for (const [re, label] of PATTERNS) {
    if (re.test(blob)) block(`${label} present in tool input`);
  }
}
main();
process.exit(0);
