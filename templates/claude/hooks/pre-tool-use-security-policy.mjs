#!/usr/bin/env node
/**
 * Demo2Project — PreToolUse security policy hook (Phase 7).
 *
 * Checks the requested tool/command against a local copy of the security
 * policy ruleset. Blocks denied actions, marks require_approval ones as
 * blocked until an approval exists. Fail-open if policy unreadable.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

function block(reason) {
  process.stderr.write(`[demo2project] POLICY BLOCK: ${reason}\n`);
  process.exit(2);
}

function readPolicy(projectDir) {
  const candidates = [
    path.join(projectDir, 'config', 'security-policy.json'),
    path.join(process.env.HOME ?? '', '.demo2project', 'security-policy.json'),
  ];
  for (const c of candidates) {
    try {
      const raw = readFileSync(c, 'utf8');
      return JSON.parse(raw);
    } catch { /* try next */ }
  }
  return null;
}

function main() {
  if (process.env.DEMO2PROJECT_HOOKS_DISABLED === '1') return;
  let event;
  try { event = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { return; }
  const projectDir = event.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  const policy = readPolicy(projectDir);
  if (!policy) return;
  const tool = event.tool_name ?? '';
  const input = event.tool_input ?? {};
  const cmd = (input.command ?? '').toString();
  const writeTarget = (input.file_path ?? input.path ?? '').toString();
  if (tool === 'Bash' && cmd && Array.isArray(policy.rules)) {
    for (const r of policy.rules) {
      if (r.action !== 'command_execution') continue;
      if (Array.isArray(r.match_command_regex)) {
        for (const re of r.match_command_regex) {
          if (new RegExp(re).test(cmd)) {
            if (r.decision === 'deny') block(`policy ${r.id}: ${r.reason}`);
            if (r.decision === 'require_approval') block(`policy ${r.id} requires approval: ${r.reason}`);
          }
        }
      }
    }
  }
  if (writeTarget && (tool === 'Write' || tool === 'Edit' || tool === 'MultiEdit')) {
    for (const r of (policy.rules ?? [])) {
      if (r.action !== 'file_write') continue;
      if (Array.isArray(r.match_target_prefix)) {
        for (const prefix of r.match_target_prefix) {
          if (writeTarget === prefix || writeTarget.includes(prefix)) {
            if (r.decision === 'deny') block(`policy ${r.id}: ${r.reason}`);
            if (r.decision === 'require_approval') block(`policy ${r.id} requires approval: ${r.reason}`);
          }
        }
      }
    }
  }
}

main();
process.exit(0);
