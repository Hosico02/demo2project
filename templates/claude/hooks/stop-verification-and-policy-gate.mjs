#!/usr/bin/env node
/**
 * Demo2Project — Stop hook: verification & policy gate (Phase 7).
 *
 * Runs at end of a turn. Walks the project for any new changed files, and
 * fails (exit 2) if the most recent activity wrote to a high-risk path
 * without an approval token. Fail-open on missing state.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

function block(reason) {
  process.stderr.write(`[demo2project] STOP GATE: ${reason}\n`);
  process.exit(2);
}

const HIGH_RISK = ['src/core/safety.ts', 'src/core/redaction.ts', 'src/core/approvalGate.ts', 'src/core/autonomyPolicy.ts', 'config/security-policy.json', 'config/approval-policy.json', 'config/autonomy-policy.json', 'qa/specs/', 'templates/claude/hooks/'];

try {
  if (process.env.DEMO2PROJECT_HOOKS_DISABLED === '1') process.exit(0);
  const event = JSON.parse(readFileSync(0, 'utf8') || '{}');
  const projectDir = event.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  const auditPath = path.join(projectDir, '.demo2project', 'audit', 'hook-audit.jsonl');
  if (!existsSync(auditPath)) process.exit(0);
  const lines = readFileSync(auditPath, 'utf8').split('\n').filter((l) => l.trim());
  // Look at last 20 lines for any high-risk write without approval marker.
  const tail = lines.slice(-20).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  for (const e of tail) {
    if (e.tool === 'Write' || e.tool === 'Edit' || e.tool === 'MultiEdit') {
      const tgt = (e.summary ?? '').toString();
      for (const p of HIGH_RISK) {
        if (tgt.includes(p)) {
          const approvalFile = path.join(projectDir, '.demo2project', 'approvals');
          if (!existsSync(approvalFile)) block(`high-risk write to ${p} without approval`);
        }
      }
    }
  }
} catch { /* fail-open */ }
process.exit(0);
