import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { suggestStandardUpdates, listSuggestions, decideSuggestion } from '../src/eval/standardFeedback.js';

async function tmpSystemWithReports(reports: object[]) {
  const sys = await fs.mkdtemp(path.join(tmpdir(), 'd2p-sf-'));
  const dir = path.join(sys, 'corpus', 'anonymized');
  await fs.mkdir(dir, { recursive: true });
  let i = 0;
  for (const r of reports) await fs.writeFile(path.join(dir, `r${i++}.json`), JSON.stringify(r));
  return sys;
}

function r(arch: string, docs: number, anti = 0): object {
  return {
    project_id: 'p_' + Math.random().toString(36).slice(2, 6),
    archetype: arch,
    archetype_confidence: 0.9, selected_standard: arch,
    score_total: 40, score_grade: 'working_demo',
    score_breakdown: {}, defects_count: 0, blocker_count: 0,
    docs_truth_missing: docs, anti_gaming_findings: anti,
    structure_summary: { file_count: 5, has_readme: true, has_tests: true, has_ci: false, package_manager: 'npm', detected_frameworks: [] },
    evaluated_at: '2026-05-12T00:00:00.000Z',
  };
}

describe('StandardFeedbackLoop', () => {
  it('suggests docs_score raise when most projects of an archetype lie', async () => {
    const sys = await tmpSystemWithReports([r('node-cli', 2), r('node-cli', 3)]);
    const s = await suggestStandardUpdates(sys);
    expect(s.some((x) => x.standard_id === 'node-cli' && /docs/i.test(x.reason))).toBe(true);
  });
  it('decide writes back persisted state', async () => {
    const sys = await tmpSystemWithReports([r('node-cli', 1), r('node-cli', 2)]);
    const s = await suggestStandardUpdates(sys);
    const r1 = await decideSuggestion({ systemRoot: sys, id: s[0]!.id, decision: 'approved' });
    expect(r1?.status).toBe('approved');
    const all = await listSuggestions(sys);
    expect(all[0]!.status).toBe('approved');
  });
});
