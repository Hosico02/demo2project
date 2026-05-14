import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { takeSnapshot } from '../src/core/projectSnapshot.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const badDemo = path.join(repoRoot, 'examples', 'bad-demo');

describe('projectSnapshot', () => {
  it('detects JS package and missing baseline files for bad-demo', async () => {
    const snap = await takeSnapshot(badDemo);
    expect(snap.package_manager).toBe('npm');
    expect(snap.detected_language).toMatch(/javascript|typescript-or-javascript/);
    expect(snap.test_commands).toEqual([]);
    expect(snap.missing_files).toContain('README.md');
    expect(snap.missing_files).toContain('.gitignore');
  });

  it('detects this repo as a TypeScript project with test+build scripts', async () => {
    const snap = await takeSnapshot(repoRoot);
    expect(snap.detected_language).toBe('typescript');
    expect(snap.test_commands.length).toBeGreaterThan(0);
    expect(snap.build_commands.length).toBeGreaterThan(0);
    expect(snap.important_files).toContain('package.json');
    expect(snap.important_files).toContain('tsconfig.json');
  });

  it('prefers Python when package.json is only compatibility scaffolding', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-py-snap-'));
    await fs.writeFile(path.join(dir, 'app.py'), 'print("hi")\n');
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask>=3.0.0\n');
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      scripts: {
        test: 'node --test tests',
        build: 'node -e "console.log(\'build ok\')"',
      },
    }));
    await fs.writeFile(path.join(dir, 'tsconfig.json'), '{}');

    const snap = await takeSnapshot(dir);

    expect(snap.detected_language).toBe('python');
    expect(snap.detected_frameworks).toContain('flask');
    expect(snap.package_manager).toBe('pip');
    expect(snap.start_commands).toContain('python3 app.py');
    expect(snap.important_files).toContain('app.py');
  });

  it('keeps pip package manager when pyproject is generic metadata plus requirements', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-py-pm-'));
    await fs.writeFile(path.join(dir, 'app.py'), 'print("hi")\n');
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask>=3.0.0\n');
    await fs.writeFile(path.join(dir, 'pyproject.toml'), '[project]\nname = "demo"\n');

    const snap = await takeSnapshot(dir);

    expect(snap.detected_language).toBe('python');
    expect(snap.package_manager).toBe('pip');
  });

  it('treats constraints.txt as Python dependency reproducibility evidence', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-py-constraints-snap-'));
    await fs.writeFile(path.join(dir, 'app.py'), 'print("hi")\n');
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask>=3.0.0\n');
    await fs.writeFile(path.join(dir, 'constraints.txt'), 'flask>=3.0.0,<4.0.0\n');

    const snap = await takeSnapshot(dir);

    expect(snap.dependency_summary.has_lockfile).toBe(true);
  });
});
