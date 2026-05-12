import path from 'node:path';
import { writeJson, readJsonSafe } from '../utils/json.js';
import { ensureDir, writeText } from '../utils/fs.js';
import { stateDir } from '../utils/paths.js';
import { nowIso, shortId } from '../utils/time.js';
import { loadSession } from '../eval/longHorizonAutonomy.js';
import { bisect } from './regressionBisector.js';
import { reportMemoryHealth } from '../qa/QAMemoryHealth.js';

/**
 * HumanHandoffReport (Phase 6) — emitted whenever the autonomy controller
 * stops, hits a pending_approval, or otherwise cannot make safe forward
 * progress. The point is to hand the human a structured, actionable
 * summary instead of a wall of logs.
 */

export interface HumanHandoffReport {
  id: string;
  session_id: string;
  generated_at: string;
  reason_for_handoff: string;
  current_state: string;
  unresolved_blockers: string[];
  failed_attempts: string[];
  suspected_root_causes: string[];
  recommended_human_actions: string[];
  safe_next_steps: string[];
  files_to_review: string[];
  commands_to_run: string[];
  evidence_summary: string;
  rollback_status: string;
  risk_level: 'low' | 'medium' | 'high' | 'blocker';
}

function handoffPath(projectPath: string, id: string): string {
  return path.join(stateDir(projectPath), 'handoff', `${id}.json`);
}

export async function createHandoff(opts: {
  projectPath: string;
  sessionId: string;
  reason?: string;
}): Promise<HumanHandoffReport> {
  const s = await loadSession(opts.projectPath, opts.sessionId);
  const reg = await bisect(opts.projectPath, opts.sessionId);
  const qa = await reportMemoryHealth(opts.projectPath);

  const failedAttempts: string[] = [];
  const blockers: string[] = [];
  const suspected: string[] = [];
  if (reg.first_detected_iteration) {
    failedAttempts.push(`regression first detected at iteration ${reg.first_detected_iteration}`);
    suspected.push(reg.root_cause_hypothesis);
  }
  if (s?.status === 'pending_approval') {
    blockers.push(`session pending_approval: ${s.final_recommendation ?? '(unspecified)'}`);
  }
  if (qa.noisy_cases > 0) blockers.push(`${qa.noisy_cases} noisy QA cases`);
  if (qa.recommended_retirements.length > 0) blockers.push(`${qa.recommended_retirements.length} QA cases recommended for retirement`);

  const rec: HumanHandoffReport = {
    id: shortId('hdf'),
    session_id: opts.sessionId,
    generated_at: nowIso(),
    reason_for_handoff: opts.reason ?? s?.final_recommendation ?? 'stopped',
    current_state: s?.status ?? 'unknown',
    unresolved_blockers: blockers,
    failed_attempts: failedAttempts,
    suspected_root_causes: suspected,
    recommended_human_actions: [
      'review .demo2project/sessions/<session>.json',
      'review reports/autonomy/<session>.md',
      'inspect QA case retirements via qa:health',
      reg.rollback_recommendation !== 'no_rollback' ? 'run rollback:stable --project <p> --session <s>' : 'no rollback needed',
    ],
    safe_next_steps: ['lower autonomy_level to L2 or L1', 'rerun analyze + gap to recompute baseline', 'manually edit affected files'],
    files_to_review: reg.affected_files,
    commands_to_run: ['pnpm test', 'pnpm build', 'demo2project self-check'],
    evidence_summary: `bisector: ${reg.root_cause_hypothesis}; qa_noise=${qa.memory_noise_score}`,
    rollback_status: reg.rollback_recommendation,
    risk_level: reg.severity === 'blocker' ? 'blocker' : reg.severity === 'high' ? 'high' : 'medium',
  };
  const fp = handoffPath(opts.projectPath, rec.id);
  await ensureDir(path.dirname(fp));
  await writeJson(fp, rec);
  // Also emit markdown
  const md = path.join(path.dirname(fp), `${rec.id}.md`);
  await writeText(md, renderMd(rec));
  return rec;
}

function renderMd(r: HumanHandoffReport): string {
  return [
    `# Human handoff ${r.id}`,
    '',
    `- Session: ${r.session_id}`,
    `- Reason: ${r.reason_for_handoff}`,
    `- Current state: ${r.current_state}`,
    `- Risk: ${r.risk_level}`,
    '',
    '## Blockers',
    ...r.unresolved_blockers.map((b) => `- ${b}`),
    '',
    '## Suspected causes',
    ...r.suspected_root_causes.map((c) => `- ${c}`),
    '',
    '## Recommended actions',
    ...r.recommended_human_actions.map((a) => `- ${a}`),
    '',
    '## Files to review',
    ...r.files_to_review.map((f) => `- ${f}`),
    '',
    '## Commands to run',
    ...r.commands_to_run.map((c) => `\`\`\`bash\n${c}\n\`\`\``),
    '',
  ].join('\n');
}

export async function showHandoff(projectPath: string, sessionId?: string, id?: string): Promise<HumanHandoffReport | null> {
  if (id) return readJsonSafe<HumanHandoffReport>(handoffPath(projectPath, id));
  // session-based: pick most recent matching report
  const { promises: fs } = await import('node:fs');
  const dir = path.join(stateDir(projectPath), 'handoff');
  let entries: string[] = [];
  try { entries = await fs.readdir(dir); } catch { return null; }
  for (const f of entries.sort().reverse()) {
    if (!f.endsWith('.json')) continue;
    const r = await readJsonSafe<HumanHandoffReport>(path.join(dir, f));
    if (r && (!sessionId || r.session_id === sessionId)) return r;
  }
  return null;
}
