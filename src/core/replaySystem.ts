import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { writeJson, readJsonSafe } from '../utils/json.js';
import { ensureDir, writeText } from '../utils/fs.js';
import { stateDir, eventsDir, iterationsDir } from '../utils/paths.js';
import { nowIso, shortId } from '../utils/time.js';
import { redact } from './redaction.js';
import { runCommand } from './commandRunner.js';
import { loadSession } from '../eval/longHorizonAutonomy.js';

/**
 * ReplaySystem (Phase 6).
 *
 * A ReplayBundle is a self-contained snapshot of one autonomy session:
 *   - the session JSON
 *   - copies of event JSONL files
 *   - copies of iteration summaries
 *   - copies of evidence graphs
 *   - the QA case store at the time
 *   - the git ref (commit hash if available)
 *   - a short "replay instructions" doc
 *
 * EVERYTHING is run through `redact()` before write. Source code is NOT
 * bundled — replay reproduces the *decisions*, not the codebase.
 */

export interface ReplayBundle {
  id: string;
  session_id: string;
  iteration_ids: string[];
  created_at: string;
  project_snapshot_ref: string;
  event_log_ref: string;
  evidence_graph_ref: string;
  qa_memory_ref: string;
  git_ref: string | null;
  redaction_status: 'redacted' | 'raw';
  replay_instructions: string;
}

function bundleDir(projectPath: string, id: string): string {
  return path.join(stateDir(projectPath), 'replay', id);
}

async function tryGitRef(projectPath: string): Promise<string | null> {
  const r = await runCommand('git rev-parse HEAD', { cwd: projectPath, timeoutMs: 5000 });
  return r.passed ? r.stdout_summary.trim() : null;
}

async function copyAndRedact(src: string, dst: string): Promise<void> {
  let txt: string | null = null;
  try { txt = await fs.readFile(src, 'utf8'); } catch { return; }
  await ensureDir(path.dirname(dst));
  await writeText(dst, redact(txt));
}

export async function createReplayBundle(projectPath: string, sessionId: string): Promise<ReplayBundle> {
  const session = await loadSession(projectPath, sessionId);
  if (!session) throw new Error(`no session ${sessionId} at ${projectPath}`);

  const id = shortId('rpl');
  const dir = bundleDir(projectPath, id);
  await ensureDir(dir);

  // copy + redact session
  await copyAndRedact(
    path.join(stateDir(projectPath), 'sessions', `${sessionId}.json`),
    path.join(dir, 'session.json'),
  );

  // copy event logs for this session's iterations
  for (const iterId of session.iterations) {
    await copyAndRedact(
      path.join(eventsDir(projectPath), `${iterId}.jsonl`),
      path.join(dir, 'events', `${iterId}.jsonl`),
    );
    await copyAndRedact(
      path.join(iterationsDir(projectPath), `${iterId}.json`),
      path.join(dir, 'iterations', `${iterId}.json`),
    );
    await copyAndRedact(
      path.join(stateDir(projectPath), 'evidence', `${iterId}.json`),
      path.join(dir, 'evidence', `${iterId}.json`),
    );
  }

  // copy + redact QA memory
  await copyAndRedact(
    path.join(stateDir(projectPath), 'qa-cases.json'),
    path.join(dir, 'qa-cases.json'),
  );

  const gitRef = await tryGitRef(projectPath);

  const bundle: ReplayBundle = {
    id,
    session_id: sessionId,
    iteration_ids: session.iterations,
    created_at: nowIso(),
    project_snapshot_ref: createHash('sha256').update(path.resolve(projectPath)).digest('hex').slice(0, 16),
    event_log_ref: 'events/*.jsonl',
    evidence_graph_ref: 'evidence/*.json',
    qa_memory_ref: 'qa-cases.json',
    git_ref: gitRef,
    redaction_status: 'redacted',
    replay_instructions:
      'Load session.json. Walk iterations/<iter>.json to inspect each round. ' +
      'evidence/<iter>.json explains the claim chain. events/<iter>.jsonl is the audit trail. ' +
      'qa-cases.json is the persistent QA memory at the time of capture. ' +
      'NOTE: source code is NOT bundled — pair this replay with the matching git_ref to inspect code.',
  };
  await writeJson(path.join(dir, 'bundle.json'), bundle);
  return bundle;
}

export async function listBundles(projectPath: string): Promise<ReplayBundle[]> {
  const root = path.join(stateDir(projectPath), 'replay');
  let entries: string[] = [];
  try { entries = await fs.readdir(root); } catch { return []; }
  const out: ReplayBundle[] = [];
  for (const id of entries) {
    const r = await readJsonSafe<ReplayBundle>(path.join(root, id, 'bundle.json'));
    if (r) out.push(r);
  }
  return out;
}

export async function loadBundle(projectPath: string, id: string): Promise<ReplayBundle | null> {
  return readJsonSafe<ReplayBundle>(path.join(bundleDir(projectPath, id), 'bundle.json'));
}

export interface ReplayRunResult {
  bundle_id: string;
  iteration_count: number;
  loaded_event_count: number;
  qa_case_count: number;
}

export async function runReplay(projectPath: string, id: string): Promise<ReplayRunResult> {
  const b = await loadBundle(projectPath, id);
  if (!b) throw new Error('bundle not found');
  let events = 0;
  for (const iterId of b.iteration_ids) {
    const txt = await readJsonSafe<unknown>(path.join(bundleDir(projectPath, id), 'iterations', `${iterId}.json`));
    if (txt) events++;
    // Could parse events/<iter>.jsonl line by line; for v0.0.6 we just count files.
  }
  const qa = (await readJsonSafe<unknown[]>(path.join(bundleDir(projectPath, id), 'qa-cases.json'))) ?? [];
  return { bundle_id: id, iteration_count: b.iteration_ids.length, loaded_event_count: events, qa_case_count: qa.length };
}

export async function explainBundle(projectPath: string, id: string): Promise<{ bundle: ReplayBundle | null; iterations: number; qa_cases: number; }> {
  const b = await loadBundle(projectPath, id);
  if (!b) return { bundle: null, iterations: 0, qa_cases: 0 };
  const qa = (await readJsonSafe<unknown[]>(path.join(bundleDir(projectPath, id), 'qa-cases.json'))) ?? [];
  return { bundle: b, iterations: b.iteration_ids.length, qa_cases: qa.length };
}
