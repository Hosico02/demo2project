#!/usr/bin/env node
/**
 * Demo2Project — PreToolUse command guard (Phase 7).
 *
 * Stricter pattern set than safety.ts baseline: blocks chmod 777, su, nc,
 * scp/ssh to remote, dd-to-raw-device, redirect to /etc, ~/.ssh, ~/.aws,
 * and download-then-execute combos.
 */
import { readFileSync } from 'node:fs';

function block(reason) {
  process.stderr.write(`[demo2project] COMMAND GUARD: ${reason}\n`);
  process.exit(2);
}

const PATTERNS = [
  [/\bchmod\s+-R?\s+777\b/, 'chmod 777'],
  [/\bchown\s+-R\b/, 'chown -R'],
  [/\bsu\s+-/, 'su escalation'],
  [/\bnc(?:at)?\s+(-l\s+)?-?[ev]?\s*[a-z0-9.\-]+\s+\d+/, 'netcat'],
  [/\bssh\s+[^@\s]+@/, 'ssh remote'],
  [/\bscp\s+\S+\s+[^@\s]+@/, 'scp upload'],
  [/\brm\s+-rf?\s+\.git\b/, 'rm .git'],
  [/\bdd\s+if=.+of=\/dev\/sd/, 'dd raw device'],
  [/>\s*\/etc\//, 'redirect to /etc'],
  [/>\s*~\/\.ssh\//, 'write ~/.ssh'],
  [/>\s*~\/\.aws\//, 'write ~/.aws'],
  [/\bcurl\s+[^|]*\s+[-\s]?o\s+\/tmp\/[^\s]+\s*;\s*(bash|sh)\s+\/tmp\//, 'download-then-execute'],
  [/\benv\s+\|\s*(curl|wget|nc)/, 'env piped to network tool'],
];

function main() {
  if (process.env.DEMO2PROJECT_HOOKS_DISABLED === '1') return;
  let event;
  try { event = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { return; }
  const tool = event.tool_name ?? '';
  if (tool !== 'Bash') return;
  const cmd = (event.tool_input?.command ?? '').toString();
  for (const [re, reason] of PATTERNS) {
    if (re.test(cmd)) block(reason);
  }
}
main();
process.exit(0);
