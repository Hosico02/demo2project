import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { similarProjects } from '../src/eval/projectSimilarity.js';

async function tmpSystemWithReports(reports: object[]) {
  const sys = await fs.mkdtemp(path.join(tmpdir(), 'd2p-sim-'));
  const dir = path.join(sys, 'corpus', 'anonymized');
  await fs.mkdir(dir, { recursive: true });
  let i = 0;
  for (const r of reports) await fs.writeFile(path.join(dir, `r${i++}.json`), JSON.stringify(r));
  return sys;
}

async function tmpProject(arch: 'node-cli' | 'react-app') {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-sim-proj-'));
  if (arch === 'node-cli') {
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'x', bin: { x: 'bin/x.js' } }));
    await fs.mkdir(path.join(dir, 'bin'), { recursive: true });
    await fs.writeFile(path.join(dir, 'bin/x.js'), '#!/usr/bin/env node\n');
  } else {
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'x', dependencies: { react: '^18', 'react-dom': '^18' } }));
    await fs.writeFile(path.join(dir, 'index.html'), '<html></html>');
  }
  return dir;
}

function r(arch: string, frameworks: string[] = []): object {
  return {
    project_id: arch + '_' + Math.random().toString(36).slice(2, 6),
    archetype: arch,
    archetype_confidence: 0.9,
    selected_standard: arch,
    score_total: 50,
    score_grade: 'working_demo',
    score_breakdown: {},
    defects_count: 0, blocker_count: 0,
    docs_truth_missing: 0, anti_gaming_findings: 0,
    structure_summary: { file_count: 5, has_readme: true, has_tests: true, has_ci: false, package_manager: 'npm', detected_frameworks: frameworks },
    evaluated_at: '2026-05-12T00:00:00.000Z',
  };
}

describe('ProjectSimilarityEngine', () => {
  it('returns matches with shared archetype', async () => {
    const sys = await tmpSystemWithReports([r('node-cli'), r('node-cli'), r('react-app', ['react'])]);
    const proj = await tmpProject('node-cli');
    const hits = await similarProjects({ systemRoot: sys, projectPath: proj });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.archetype).toBe('node-cli');
  });
  it('orders by similarity desc', async () => {
    const sys = await tmpSystemWithReports([r('react-app', ['react']), r('node-cli')]);
    const proj = await tmpProject('react-app');
    const hits = await similarProjects({ systemRoot: sys, projectPath: proj });
    expect(hits[0]!.archetype).toBe('react-app');
  });
});
