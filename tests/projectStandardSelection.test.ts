import { describe, it, expect } from 'vitest';
import { selectStandardForSnapshot, listStandards, loadStandard } from '../src/standards/standardsLibrary.js';
import type { ProjectSnapshot } from '../src/core/types.js';

function snap(overrides: Partial<ProjectSnapshot>): ProjectSnapshot {
  return {
    project_path: '/tmp/x',
    detected_language: 'unknown',
    detected_frameworks: [],
    package_manager: 'unknown',
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

describe('standards library', () => {
  it('lists at least the seven canonical standards', async () => {
    const names = await listStandards();
    for (const required of [
      'generic-project',
      'node-cli',
      'typescript-library',
      'react-app',
      'nextjs-app',
      'python-package',
      'fastapi-api',
    ]) {
      expect(names).toContain(required);
    }
  });

  it('loadStandard returns null for unknown', async () => {
    expect(await loadStandard('does-not-exist')).toBeNull();
  });

  it('selects nextjs-app when next framework detected', async () => {
    const { name } = await selectStandardForSnapshot(
      snap({ detected_language: 'typescript', detected_frameworks: ['next', 'react'], package_manager: 'pnpm' }),
    );
    expect(name).toBe('nextjs-app');
  });

  it('selects react-app for react without next', async () => {
    const { name } = await selectStandardForSnapshot(
      snap({ detected_language: 'typescript', detected_frameworks: ['react'], package_manager: 'pnpm' }),
    );
    expect(name).toBe('react-app');
  });

  it('selects typescript-library for TS with tsconfig + no app framework', async () => {
    const { name } = await selectStandardForSnapshot(
      snap({
        detected_language: 'typescript',
        detected_frameworks: ['vitest'],
        package_manager: 'pnpm',
        important_files: ['tsconfig.json'],
      }),
    );
    expect(name).toBe('typescript-library');
  });

  it('selects python-package for python lang', async () => {
    const { name } = await selectStandardForSnapshot(
      snap({ detected_language: 'python', package_manager: 'pip' }),
    );
    expect(name).toBe('python-package');
  });

  it('falls back to generic-project for unknown stack', async () => {
    const { name } = await selectStandardForSnapshot(snap({}));
    expect(name).toBe('generic-project');
  });
});
