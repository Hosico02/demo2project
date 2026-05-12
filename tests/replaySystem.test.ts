import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { createReplayBundle, loadBundle, runReplay, listBundles, explainBundle } from '../src/core/replaySystem.js';

async function setup(): Promise<{ proj: string; session: string }> {
  const proj = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rpl-'));
  // create a minimal session file + 1 iteration + 1 qa file
  const sessionId = 'sess_test';
  const sessDir = path.join(proj, '.demo2project', 'sessions');
  await fs.mkdir(sessDir, { recursive: true });
  await fs.writeFile(path.join(sessDir, `${sessionId}.json`), JSON.stringify({
    id: sessionId, project_path: proj, project_path_hash: 'aaa', archetype: 'node-cli',
    provider: 'mock', autonomy_level: 'L0_READ_ONLY', started_at: 't', status: 'completed',
    iterations: ['iter1'], budget: { max_iterations: 1, max_cost_usd: 1, max_wall_time_ms: 1 },
    stop_conditions: [],
  }));
  // event log + iteration summary + evidence + qa
  const iter = path.join(proj, '.demo2project', 'iterations');
  await fs.mkdir(iter, { recursive: true });
  await fs.writeFile(path.join(iter, 'iter1.json'), JSON.stringify({ ok: true }));
  const ev = path.join(proj, '.demo2project', 'events');
  await fs.mkdir(ev, { recursive: true });
  await fs.writeFile(path.join(ev, 'iter1.jsonl'), '{"line":1}\n');
  const evi = path.join(proj, '.demo2project', 'evidence');
  await fs.mkdir(evi, { recursive: true });
  await fs.writeFile(path.join(evi, 'iter1.json'), '{}');
  await fs.writeFile(path.join(proj, '.demo2project', 'qa-cases.json'), '[]');
  return { proj, session: sessionId };
}

describe('ReplaySystem', () => {
  it('creates a redacted bundle', async () => {
    const { proj, session } = await setup();
    const b = await createReplayBundle(proj, session);
    expect(b.iteration_ids).toContain('iter1');
    expect(b.redaction_status).toBe('redacted');
    const loaded = await loadBundle(proj, b.id);
    expect(loaded?.session_id).toBe(session);
  });
  it('runs/explains a bundle', async () => {
    const { proj, session } = await setup();
    const b = await createReplayBundle(proj, session);
    const r = await runReplay(proj, b.id);
    expect(r.iteration_count).toBe(1);
    const e = await explainBundle(proj, b.id);
    expect(e.bundle?.id).toBe(b.id);
  });
  it('listBundles returns the persisted bundle', async () => {
    const { proj, session } = await setup();
    await createReplayBundle(proj, session);
    const list = await listBundles(proj);
    expect(list.length).toBeGreaterThan(0);
  });
});
