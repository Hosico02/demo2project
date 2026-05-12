import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  loadAllScopes,
  upsertScoped,
  selectForSnapshot,
  repoScopePath,
  workspaceScopePath,
  globalScopePath,
} from '../src/qa/QAMemoryScopes.js';
import type { QACase, ProjectSnapshot } from '../src/core/types.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

async function tmpProject() { return fs.mkdtemp(path.join(tmpdir(), 'd2p-qams-')); }
async function tmpHome() { return fs.mkdtemp(path.join(tmpdir(), 'd2p-home-')); }

function mkCase(overrides: Partial<QACase>): QACase {
  return {
    id: 'qa_' + Math.random().toString(36).slice(2, 8),
    title: 't',
    category: 'misc',
    severity: 'medium',
    frequency: 1,
    status: 'active',
    project_type: ['generic'],
    bug_source: { iteration_id: 'i', agent: 'qa', source: 's', related_files: [] },
    trigger_condition: '',
    human_flow: [],
    expected_behavior: '',
    actual_failure: '',
    regression_assertions: [],
    reproduction_steps: [],
    suggested_test_type: 'unit',
    fingerprint: 'fp_' + Math.random().toString(36).slice(2, 6),
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    last_seen_at: '2026-01-01T00:00:00.000Z',
    related_files: [],
    ...overrides,
  };
}

function snap(overrides: Partial<ProjectSnapshot>): ProjectSnapshot {
  return {
    project_path: '/tmp/x',
    detected_language: 'typescript',
    detected_frameworks: ['react'],
    package_manager: 'pnpm',
    test_commands: [],
    build_commands: [],
    start_commands: [],
    important_files: [],
    missing_files: [],
    dependency_summary: { runtime: 0, dev: 0, has_lockfile: false },
    timestamp: '1970-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('QA memory scopes', () => {
  it('repo / workspace / global paths are distinct', async () => {
    const proj = await tmpProject();
    const home = await tmpHome();
    expect(repoScopePath(proj)).not.toBe(workspaceScopePath(home));
    expect(workspaceScopePath(home)).not.toBe(globalScopePath(repoRoot));
    expect(globalScopePath(repoRoot)).toContain('qa/specs/global-patterns.json');
  });

  it('seeded global-patterns.json is loadable', async () => {
    const r = await loadAllScopes({ projectPath: await tmpProject(), systemRoot: repoRoot, homeDir: await tmpHome() });
    expect(r.global.length).toBeGreaterThanOrEqual(3);
    expect(r.global.some((c) => c.fingerprint === 'missing_validation_after_code_change')).toBe(true);
  });

  it('upsertScoped persists by scope and dedupes by fingerprint', async () => {
    const proj = await tmpProject();
    const home = await tmpHome();
    const opts = { projectPath: proj, systemRoot: repoRoot, homeDir: home };
    const c1 = mkCase({ fingerprint: 'fp1' });
    await upsertScoped(c1, 'repo', opts);
    await upsertScoped(c1, 'repo', opts);
    const r = await loadAllScopes(opts);
    expect(r.repo.filter((c) => c.fingerprint === 'fp1').length).toBe(1);
  });

  it('selectForSnapshot filters by project_type', () => {
    const generic = mkCase({ project_type: ['generic'] });
    const pyOnly = mkCase({ project_type: ['python'] });
    const reactOnly = mkCase({ project_type: ['react'] });
    const result = selectForSnapshot(
      { global: [generic, pyOnly], workspace: [reactOnly], repo: [] },
      snap({ detected_language: 'typescript', detected_frameworks: ['react'] }),
    );
    const fps = result.map((c) => c.fingerprint);
    expect(fps).toContain(generic.fingerprint);
    expect(fps).toContain(reactOnly.fingerprint);
    expect(fps).not.toContain(pyOnly.fingerprint);
  });
});
