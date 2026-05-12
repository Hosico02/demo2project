import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { learnWorkspace, loadPatterns } from '../src/eval/crossProjectLearning.js';

async function tmpSystemWithReports(reports: object[]): Promise<string> {
  const sys = await fs.mkdtemp(path.join(tmpdir(), 'd2p-cpl-'));
  const dir = path.join(sys, 'corpus', 'anonymized');
  await fs.mkdir(dir, { recursive: true });
  let i = 0;
  for (const r of reports) await fs.writeFile(path.join(dir, `r${i++}.json`), JSON.stringify(r));
  return sys;
}

function fakeReport(over: Partial<{ archetype: string; docs_truth_missing: number; anti_gaming_findings: number; project_id: string; has_tests: boolean }> = {}): object {
  return {
    project_id: over.project_id ?? Math.random().toString(36).slice(2, 8),
    archetype: over.archetype ?? 'node-cli',
    archetype_confidence: 0.9,
    selected_standard: 'node-cli',
    score_total: 40,
    score_grade: 'working_demo',
    score_breakdown: {},
    defects_count: 0,
    blocker_count: 0,
    docs_truth_missing: over.docs_truth_missing ?? 0,
    anti_gaming_findings: over.anti_gaming_findings ?? 0,
    structure_summary: {
      file_count: 4,
      has_readme: true,
      has_tests: over.has_tests ?? true,
      has_ci: false,
      package_manager: 'npm',
      detected_frameworks: [],
    },
    evaluated_at: '2026-05-12T00:00:00.000Z',
  };
}

describe('CrossProjectLearningEngine', () => {
  it('returns no patterns for empty corpus', async () => {
    const sys = await tmpSystemWithReports([]);
    const r = await learnWorkspace({ systemRoot: sys });
    expect(r.length).toBe(0);
  });
  it('emits a docs_truth_failure pattern when multiple projects lie', async () => {
    const sys = await tmpSystemWithReports([
      fakeReport({ docs_truth_missing: 3 }),
      fakeReport({ docs_truth_missing: 4 }),
    ]);
    const r = await learnWorkspace({ systemRoot: sys });
    expect(r.some((p) => p.pattern_type === 'docs_truth_failure')).toBe(true);
  });
  it('emits a standard_gap when 3+ projects ship without tests', async () => {
    const sys = await tmpSystemWithReports([
      fakeReport({ has_tests: false }),
      fakeReport({ has_tests: false }),
      fakeReport({ has_tests: false }),
    ]);
    const r = await learnWorkspace({ systemRoot: sys });
    expect(r.some((p) => p.pattern_type === 'standard_gap')).toBe(true);
  });
  it('persists and re-loads patterns', async () => {
    const sys = await tmpSystemWithReports([
      fakeReport({ docs_truth_missing: 1 }),
      fakeReport({ docs_truth_missing: 1 }),
    ]);
    await learnWorkspace({ systemRoot: sys });
    const r = await loadPatterns(sys);
    expect(r.length).toBeGreaterThan(0);
  });
});
