import path from 'node:path';
import { ensureDir, writeText } from '../../utils/fs.js';
import { writeJson } from '../../utils/json.js';
import { readAll } from './AuditLog.js';
import { verify } from './AuditVerifier.js';

export async function writeReport(systemRoot: string): Promise<{ json: string; md: string; total: number; integrity_ok: boolean }> {
  const events = await readAll(systemRoot);
  const chain = await verify(systemRoot);
  const byAction: Record<string, number> = {};
  const byActor: Record<string, number> = {};
  const byDecision: Record<string, number> = {};
  for (const e of events) {
    byAction[e.action] = (byAction[e.action] ?? 0) + 1;
    byActor[e.actor] = (byActor[e.actor] ?? 0) + 1;
    byDecision[e.decision] = (byDecision[e.decision] ?? 0) + 1;
  }
  const dir = path.join(systemRoot, 'reports', 'audit');
  await ensureDir(dir);
  const jsonPath = path.join(dir, 'audit-report.json');
  const mdPath = path.join(dir, 'audit-report.md');
  const summary = { total: events.length, integrity: chain, by_action: byAction, by_actor: byActor, by_decision: byDecision };
  await writeJson(jsonPath, summary);
  const lines = ['# Audit Report', '', `- Total events: ${events.length}`, `- Chain integrity: ${chain.ok ? 'ok' : 'broken at ' + chain.broken_at}`, '', '## By action', ...Object.entries(byAction).map(([k, v]) => `- ${k}: ${v}`), '', '## By actor', ...Object.entries(byActor).map(([k, v]) => `- ${k}: ${v}`), '', '## By decision', ...Object.entries(byDecision).map(([k, v]) => `- ${k}: ${v}`), ''];
  await writeText(mdPath, lines.join('\n'));
  return { json: jsonPath, md: mdPath, total: events.length, integrity_ok: chain.ok };
}
