import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHandoff, showHandoff } from '../src/core/humanHandoff.js';

async function setup(): Promise<string> {
  const proj = await fs.mkdtemp(path.join(tmpdir(), 'd2p-hdf-'));
  const sessionId = 'sess_hdf';
  const sessDir = path.join(proj, '.demo2project', 'sessions');
  await fs.mkdir(sessDir, { recursive: true });
  await fs.writeFile(path.join(sessDir, `${sessionId}.json`), JSON.stringify({
    id: sessionId, project_path: proj, project_path_hash: 'aaa', archetype: 'node-cli',
    provider: 'mock', autonomy_level: 'L1_ANALYZE_AND_REPORT', started_at: 't', status: 'pending_approval',
    iterations: [], budget: { max_iterations: 1, max_cost_usd: 0, max_wall_time_ms: 0 },
    stop_conditions: [], final_recommendation: 'review_required',
  }));
  return proj;
}

describe('HumanHandoffReport', () => {
  it('creates a structured handoff with rec actions', async () => {
    const proj = await setup();
    const r = await createHandoff({ projectPath: proj, sessionId: 'sess_hdf' });
    expect(r.session_id).toBe('sess_hdf');
    expect(r.recommended_human_actions.length).toBeGreaterThan(0);
    expect(r.commands_to_run.length).toBeGreaterThan(0);
  });
  it('showHandoff returns the persisted record by id', async () => {
    const proj = await setup();
    const r = await createHandoff({ projectPath: proj, sessionId: 'sess_hdf' });
    const loaded = await showHandoff(proj, undefined, r.id);
    expect(loaded?.id).toBe(r.id);
  });
});
