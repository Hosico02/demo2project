#!/usr/bin/env node
/**
 * Demo2Project — Stop hook: incident check (Phase 7).
 *
 * If an open critical/high incident exists, OR the emergency stop is active,
 * fail the turn so Claude cannot continue making changes.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

function block(reason) {
  process.stderr.write(`[demo2project] INCIDENT GATE: ${reason}\n`);
  process.exit(2);
}

try {
  if (process.env.DEMO2PROJECT_HOOKS_DISABLED === '1') process.exit(0);
  const event = JSON.parse(readFileSync(0, 'utf8') || '{}');
  const projectDir = event.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  const stopFile = path.join(projectDir, '.demo2project', 'governance', 'emergency-stop.json');
  if (existsSync(stopFile)) {
    try {
      const r = JSON.parse(readFileSync(stopFile, 'utf8'));
      if (r.active) block(`emergency stop active (${r.reason ?? 'no reason'})`);
    } catch { /* skip */ }
  }
  const incDir = path.join(projectDir, '.demo2project', 'governance', 'incidents');
  if (existsSync(incDir)) {
    const files = readdirSync(incDir).filter((f) => f.endsWith('.json'));
    for (const f of files) {
      try {
        const i = JSON.parse(readFileSync(path.join(incDir, f), 'utf8'));
        if (i.status === 'open' && (i.severity === 'critical' || i.severity === 'high')) {
          block(`open ${i.severity} incident ${i.id} (${i.type})`);
        }
      } catch { /* skip */ }
    }
  }
} catch { /* fail-open on parse errors */ }
process.exit(0);
