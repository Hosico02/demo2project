import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { runGeneralization } from '../src/eval/generalization.js';

async function tmpSysWith(reports: object[]) {
  const sys = await fs.mkdtemp(path.join(tmpdir(), 'd2p-gen-'));
  const dir = path.join(sys, 'corpus', 'anonymized');
  await fs.mkdir(dir, { recursive: true });
  let i = 0;
  for (const r of reports) await fs.writeFile(path.join(dir, `r${i++}.json`), JSON.stringify(r));
  return sys;
}

function rep(arch: string, score: number, grade: string, docsMiss = 0): object {
  return {
    project_id: 'p_' + Math.random().toString(36).slice(2, 6),
    archetype: arch, archetype_confidence: 0.9, selected_standard: arch,
    score_total: score, score_grade: grade, score_breakdown: {},
    defects_count: 0, blocker_count: 0,
    docs_truth_missing: docsMiss, anti_gaming_findings: 0,
    structure_summary: { file_count: 5, has_readme: true, has_tests: true, has_ci: false, package_manager: 'npm', detected_frameworks: [] },
    evaluated_at: '2026-05-12T00:00:00.000Z',
  };
}

describe('GeneralizationEvaluator', () => {
  it('aggregates by archetype', async () => {
    const sys = await tmpSysWith([
      rep('node-cli', 60, 'structured_prototype'),
      rep('node-cli', 22, 'raw_demo'),
      rep('react-app', 40, 'working_demo'),
    ]);
    const r = await runGeneralization({ systemRoot: sys });
    expect(r.total_projects).toBe(3);
    expect(r.projects_by_archetype['node-cli']).toBe(2);
  });
  it('filters by archetype when requested', async () => {
    const sys = await tmpSysWith([rep('node-cli', 50, 'working_demo'), rep('react-app', 50, 'working_demo')]);
    const r = await runGeneralization({ systemRoot: sys, archetype: 'react-app' });
    expect(r.total_projects).toBe(1);
  });
  it('produces a zero report on empty corpus', async () => {
    const sys = await tmpSysWith([]);
    const r = await runGeneralization({ systemRoot: sys });
    expect(r.total_projects).toBe(0);
  });
});
