import path from 'node:path';
import { runAutonomySession, listSessions, loadSession } from '../../eval/longHorizonAutonomy.js';
import { QualityTrendMonitor } from '../../core/qualityTrendMonitor.js';
import { ensureDir, writeText } from '../../utils/fs.js';
import { writeJson } from '../../utils/json.js';
import { flagString, flagNumber, requireProject } from './_shared.js';

function systemRoot(): string {
  return path.resolve(new URL('../../..', import.meta.url).pathname);
}

export async function autonomyRun(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const iter = flagNumber(flags, 'iterations', 5);
  const providerName = flagString(flags, 'provider', 'rule-based') as 'rule-based' | 'mock' | 'claude-cli';
  const session = await runAutonomySession({
    projectPath: project,
    iterations: iter,
    providerName,
    systemRoot: systemRoot(),
    goal: flagString(flags, 'goal'),
  });
  process.stdout.write(JSON.stringify(session, null, 2) + '\n');
  return 0;
}

export async function autonomyStatus(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const sessionId = flagString(flags, 'session');
  if (!sessionId) {
    const list = await listSessions(project);
    process.stdout.write(JSON.stringify({ total: list.length, sessions: list }, null, 2) + '\n');
    return 0;
  }
  const s = await loadSession(project, sessionId);
  if (!s) { process.stderr.write('not found\n'); return 1; }
  process.stdout.write(JSON.stringify(s, null, 2) + '\n');
  return 0;
}

export async function autonomyReport(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const sessionId = flagString(flags, 'session');
  if (!sessionId) { process.stderr.write('error: --session required\n'); return 2; }
  const s = await loadSession(project, sessionId);
  if (!s) { process.stderr.write('not found\n'); return 1; }
  const dir = path.join(systemRoot(), 'reports', 'autonomy');
  await ensureDir(dir);
  const json = path.join(dir, `${sessionId}.json`);
  const md = path.join(dir, `${sessionId}.md`);
  await writeJson(json, s);
  const trend = await new QualityTrendMonitor(project, sessionId).load();
  const body = [
    `# Autonomy session ${sessionId}`,
    '',
    `- Project: ${s.project_path}`,
    `- Archetype: ${s.archetype}`,
    `- Provider: ${s.provider}`,
    `- Autonomy: ${s.autonomy_level}`,
    `- Started: ${s.started_at}`,
    `- Ended:   ${s.ended_at ?? '(running)'}`,
    `- Status:  ${s.status}`,
    `- Iterations recorded: ${s.iterations.length}`,
    s.trend_summary ? `- Trend: score ${s.trend_summary.score_first} → ${s.trend_summary.score_last} (peak ${s.trend_summary.peak_score})` : '',
    '',
    '## Trend',
    '',
    trend.length === 0 ? '_no snapshots_' : '| iter | score | adj | regr | risk |\n|---|---|---|---|---|',
    ...trend.map((t) => `| ${t.iteration_id} | ${t.project_score} | ${t.confidence_adjusted_score} | ${t.regression_count} | ${t.risk_level} |`),
    '',
    `_Recommendation: ${s.final_recommendation ?? 'completed'}_`,
    '',
  ].filter(Boolean).join('\n');
  await writeText(md, body);
  process.stdout.write(JSON.stringify({ json, md }, null, 2) + '\n');
  return 0;
}

export async function trendShow(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const sessionId = flagString(flags, 'session');
  if (!sessionId) { process.stderr.write('error: --session required\n'); return 2; }
  const monitor = new QualityTrendMonitor(project, sessionId);
  const snapshots = await monitor.load();
  process.stdout.write(JSON.stringify({ session: sessionId, snapshots }, null, 2) + '\n');
  return 0;
}

export async function trendExplain(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const sessionId = flagString(flags, 'session');
  if (!sessionId) { process.stderr.write('error: --session required\n'); return 2; }
  const monitor = new QualityTrendMonitor(project, sessionId);
  const snapshots = await monitor.load();
  if (snapshots.length === 0) { process.stdout.write('{}\n'); return 0; }
  const first = snapshots[0]!.project_score;
  const last = snapshots[snapshots.length - 1]!.project_score;
  const peak = Math.max(...snapshots.map((s) => s.project_score));
  process.stdout.write(JSON.stringify({
    session: sessionId,
    iterations_observed: snapshots.length,
    first_score: first, last_score: last, peak_score: peak,
    delta_first_to_last: last - first,
    last_risk: snapshots[snapshots.length - 1]!.risk_level,
    last_regression_count: snapshots[snapshots.length - 1]!.regression_count,
  }, null, 2) + '\n');
  return 0;
}
