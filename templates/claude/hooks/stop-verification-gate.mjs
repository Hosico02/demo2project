#!/usr/bin/env node
/**
 * Demo2Project — Stop verification gate.
 *
 * Runs when Claude is about to stop. Loads this session's events and refuses
 * the stop (exit 2) if the verification gate is violated:
 *
 *   1. files were changed but no verification-shaped command was observed
 *      (test / lint / build / typecheck / smoke)
 *   2. AND no `unable_to_verify_reason` marker exists in any event
 *
 * Disable: DEMO2PROJECT_HOOKS_DISABLED=1.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

if (process.env.DEMO2PROJECT_HOOKS_DISABLED === '1') process.exit(0);

let event;
try { event = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
const projectDir = event.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const sessionId = event.session_id ?? 'claude-session';
const log = path.join(projectDir, '.demo2project', 'events', `${sessionId}.jsonl`);
if (!existsSync(log)) process.exit(0);

const VERIFY_CMD_RE = /\b(npm|pnpm|yarn|bun)\s+(test|run\s+(test|build|typecheck|lint))\b|\bvitest\b|\bjest\b|\bpytest\b|\btsc\b|\bnode\s+--test\b|\bgo\s+test\b|\bcargo\s+test\b/;

let changedFiles = 0;
let verifications = 0;
let unableToVerify = false;
let lines = [];
try { lines = readFileSync(log, 'utf8').split('\n').filter(Boolean); } catch { process.exit(0); }
for (const ln of lines) {
  let r;
  try { r = JSON.parse(ln); } catch { continue; }
  if (Array.isArray(r.files_changed) && r.files_changed.length) changedFiles += r.files_changed.length;
  if (typeof r.command === 'string' && VERIFY_CMD_RE.test(r.command)) verifications++;
  if (r.metadata?.unable_to_verify_reason) unableToVerify = true;
  if (typeof r.message === 'string' && /unable_to_verify_reason/.test(r.message)) unableToVerify = true;
}

if (changedFiles > 0 && verifications === 0 && !unableToVerify) {
  process.stderr.write(
    `[demo2project] STOP BLOCKED: ${changedFiles} file change(s) recorded with no verification ` +
      `(test/lint/build/typecheck) and no unable_to_verify_reason. Run a verification command ` +
      `or mark unable_to_verify_reason before stopping.\n`,
  );
  process.exit(2);
}
process.exit(0);
