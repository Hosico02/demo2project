import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { recordDecision, readDecisions, findDecision } from '../src/core/governanceDecisionLog.js';

async function tmp(): Promise<string> {
  return fs.mkdtemp(path.join(tmpdir(), 'd2p-gov-'));
}

describe('GovernanceDecisionLog', () => {
  it('records and re-reads decisions', async () => {
    const proj = await tmp();
    const d = await recordDecision(proj, {
      session_id: 'sess', decision_type: 'continue',
      options_considered: ['continue', 'stop'],
      selected_option: 'continue',
      reason: 'within bounds',
      risk_level: 'low',
      evidence_ids: [],
    });
    const all = await readDecisions(proj, 'sess');
    expect(all.length).toBe(1);
    expect(all[0]!.decision_id).toBe(d.decision_id);
  });
  it('finds a decision across sessions', async () => {
    const proj = await tmp();
    const d = await recordDecision(proj, {
      session_id: 's1', decision_type: 'stop',
      options_considered: ['stop'], selected_option: 'stop',
      reason: 'r', risk_level: 'medium', evidence_ids: [],
    });
    const hit = await findDecision(proj, d.decision_id);
    expect(hit?.decision_type).toBe('stop');
  });
});
