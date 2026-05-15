import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { selectStandardForSnapshot, listStandards, loadStandard } from '../src/standards/standardsLibrary.js';
import type { ProjectSnapshot } from '../src/core/types.js';
import { AnalyzerAgent } from '../src/agents/AnalyzerAgent.js';

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
      'vue-app',
      'python-package',
      'fastapi-api',
      'flask-web-app',
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

  it('selects vue-app when Vue framework is detected', async () => {
    const { name, standard } = await selectStandardForSnapshot(
      snap({ detected_language: 'javascript', detected_frameworks: ['vue'], package_manager: 'npm', important_files: ['package.json', 'src', 'vite.config.js'] }),
    );
    expect(name).toBe('vue-app');
    expect(standard.test_expectations.join('\n')).toMatch(/Vue|browser-level/i);
  });

  it('does not select node-cli just because a JavaScript package exists', async () => {
    const { name, standard } = await selectStandardForSnapshot(
      snap({
        detected_language: 'javascript',
        detected_frameworks: [],
        package_manager: 'npm',
        important_files: ['package.json', 'src', 'app.json'],
      }),
    );

    expect(name).toBe('generic-project');
    expect(standard.recommended_files).not.toContain('bin');
  });

  it('selects node-cli when an actual bin entry is present', async () => {
    const { name } = await selectStandardForSnapshot(
      snap({
        detected_language: 'javascript',
        detected_frameworks: [],
        package_manager: 'npm',
        important_files: ['package.json', 'bin', 'src'],
      }),
    );

    expect(name).toBe('node-cli');
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

  it('selects flask-web-app when Flask framework is detected', async () => {
    const { name, standard } = await selectStandardForSnapshot(
      snap({
        detected_language: 'python',
        detected_frameworks: ['flask', 'pytest'],
        package_manager: 'pip',
        important_files: ['app.py', 'requirements.txt', 'tests/test_app.py'],
        start_commands: ['python3 app.py'],
      }),
    );
    expect(name).toBe('flask-web-app');
    expect(standard.docs_expectations.join('\n')).toMatch(/routes|deployment/i);
  });

  it('falls back to generic-project for unknown stack', async () => {
    const { name } = await selectStandardForSnapshot(snap({}));
    expect(name).toBe('generic-project');
  });

  it('applies project-local config/project-standard.json as an override', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-standard-'));
    await fs.mkdir(path.join(dir, 'config'), { recursive: true });
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'x', scripts: { test: 'echo ok' } }));
    await fs.writeFile(path.join(dir, 'tsconfig.json'), '{}');
    await fs.writeFile(path.join(dir, 'README.md'), '# X\n\n## Usage\n\nRun it.\n');
    await fs.writeFile(path.join(dir, 'config', 'project-standard.json'), JSON.stringify({
      required_files: ['README.md', 'CUSTOM.md'],
      recommended_files: [],
      required_commands: [],
      quality_gates: [],
      scoring_rules: [],
      forbidden_patterns: [],
      verification_policy: {
        require_evidence_when_files_changed: true,
        max_command_timeout_ms: 120000,
        forbid_unverified_completion: true,
      },
    }));

    const result = await new AnalyzerAgent().fullAnalyze(dir);

    expect(result.standard_name).toContain('project-config');
    expect(result.gap.findings.some((f) => f.message.includes('CUSTOM.md'))).toBe(true);
    expect(result.gap.findings.some((f) => f.category === 'missing_required_command')).toBe(false);
  });
});
