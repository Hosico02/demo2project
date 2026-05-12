import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
});
