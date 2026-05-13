#!/usr/bin/env node
/**
 * Demo2Project — File access guard (Phase 7).
 *
 * Blocks reads/writes/deletes on .env, id_rsa, credentials, .aws/, .ssh/,
 * and writes to Demo2Project safety core paths.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

function block(reason) {
  process.stderr.write(`[demo2project] FILE ACCESS GUARD: ${reason}\n`);
  process.exit(2);
}

const SECRET = [/^\.env(\..*)?$/, /^id_rsa$/, /^id_ed25519$/, /credentials\.json$/i, /\.pem$/, /\.key$/];
const SECRET_DIRS = ['.ssh', '.aws', '.gnupg'];
const HIGH_RISK = ['src/core/safety.ts', 'src/core/redaction.ts', 'src/core/approvalGate.ts', 'src/core/autonomyPolicy.ts', 'config/security-policy.json', 'config/approval-policy.json', 'config/autonomy-policy.json', 'qa/specs/', 'templates/claude/hooks/'];

function main() {
  if (process.env.DEMO2PROJECT_HOOKS_DISABLED === '1') return;
  let event;
  try { event = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { return; }
  const tool = event.tool_name ?? '';
  const target = (event.tool_input?.file_path ?? event.tool_input?.path ?? '').toString();
  if (!target) return;
  const base = path.basename(target);
  if (SECRET.some((re) => re.test(base))) block(`secret file: ${target}`);
  for (const d of SECRET_DIRS) {
    if (target.includes(`/${d}/`) || target.startsWith(`${d}/`)) block(`secret dir: ${d}`);
  }
  if (tool === 'Write' || tool === 'Edit' || tool === 'MultiEdit') {
    const projectDir = event.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
    const rel = path.relative(projectDir, path.resolve(projectDir, target));
    for (const p of HIGH_RISK) {
      if (rel === p || rel.startsWith(p)) block(`high-risk path: ${rel}`);
    }
  }
}
main();
process.exit(0);
