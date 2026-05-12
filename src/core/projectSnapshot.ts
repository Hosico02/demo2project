import path from 'node:path';
import type { ProjectSnapshot } from './types.js';
import { listFiles, readTextSafe, fileExists } from '../utils/fs.js';
import { readJsonSafe } from '../utils/json.js';
import { nowIso } from '../utils/time.js';

interface PackageJson {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  type?: string;
  main?: string;
  bin?: unknown;
}

/**
 * Scan a project directory and produce a ProjectSnapshot.
 *
 * Deliberately lightweight — it reads obvious config (package.json,
 * pyproject.toml, requirements.txt), then walks the filesystem with
 * heavy-dir exclusions. No network, no parsing source code.
 */
export async function takeSnapshot(projectPath: string): Promise<ProjectSnapshot> {
  const abs = path.resolve(projectPath);
  const files = await listFiles(abs);
  const fileSet = new Set(files);

  const has = (rel: string): boolean => fileSet.has(rel);
  const hasAny = (rels: string[]): boolean => rels.some(has);

  const pkg = await readJsonSafe<PackageJson>(path.join(abs, 'package.json'));
  const pyproject = await readTextSafe(path.join(abs, 'pyproject.toml'));
  const requirements = await readTextSafe(path.join(abs, 'requirements.txt'));

  let language = 'unknown';
  const frameworks: string[] = [];

  if (pkg) {
    language = 'typescript-or-javascript';
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    if ('typescript' in deps || has('tsconfig.json')) language = 'typescript';
    else if (Object.keys(pkg).length > 0) language = 'javascript';
    for (const f of ['react', 'next', 'vue', 'svelte', 'express', 'fastify', 'nestjs', 'vitest', 'jest', 'mocha']) {
      if (f in deps) frameworks.push(f);
    }
  } else if (pyproject || requirements || files.some((f) => f.endsWith('.py'))) {
    language = 'python';
    const blob = `${pyproject ?? ''}\n${requirements ?? ''}`;
    for (const f of ['fastapi', 'flask', 'django', 'pytest', 'starlette', 'pydantic']) {
      if (new RegExp(`\\b${f}\\b`, 'i').test(blob)) frameworks.push(f);
    }
  } else if (files.some((f) => f.endsWith('.go'))) {
    language = 'go';
  } else if (files.some((f) => f.endsWith('.rs'))) {
    language = 'rust';
  }

  let pm: ProjectSnapshot['package_manager'] = 'unknown';
  if (has('pnpm-lock.yaml')) pm = 'pnpm';
  else if (has('yarn.lock')) pm = 'yarn';
  else if (has('bun.lockb') || has('bun.lock')) pm = 'bun';
  else if (has('package-lock.json')) pm = 'npm';
  else if (pkg) pm = 'npm';
  else if (pyproject) pm = 'poetry';
  else if (requirements) pm = 'pip';

  const scripts = pkg?.scripts ?? {};
  const testCommands: string[] = [];
  const buildCommands: string[] = [];
  const startCommands: string[] = [];

  if (pkg) {
    const runner = pm === 'yarn' ? 'yarn' : pm === 'pnpm' ? 'pnpm' : pm === 'bun' ? 'bun run' : 'npm run';
    if (scripts.test) testCommands.push(`${runner} test`);
    if (scripts.build) buildCommands.push(`${runner} build`);
    if (scripts.start) startCommands.push(`${runner} start`);
    if (scripts.dev && startCommands.length === 0) startCommands.push(`${runner} dev`);
    if (scripts.typecheck) buildCommands.push(`${runner} typecheck`);
  }
  if (language === 'python') {
    if (files.some((f) => /(^|\/)tests?\//.test(f) || f.startsWith('test_') || f.endsWith('_test.py'))) {
      testCommands.push('pytest -q');
    }
    if (files.includes('main.py')) startCommands.push('python main.py');
  }

  // Important + missing files (heuristic)
  const importantCandidates = [
    'README.md',
    'package.json',
    'tsconfig.json',
    'pyproject.toml',
    'requirements.txt',
    'Dockerfile',
    '.github/workflows',
    'src',
    'tests',
    '.env.example',
    '.gitignore',
  ];
  const importantFiles = importantCandidates.filter((f) =>
    has(f) || files.some((entry) => entry.startsWith(f + '/')),
  );

  const baselineExpected = ['README.md', '.gitignore'];
  if (pkg) baselineExpected.push('package.json', 'tsconfig.json');
  const missingFiles = baselineExpected.filter((f) => !importantFiles.includes(f));

  return {
    project_path: abs,
    detected_language: language,
    detected_frameworks: frameworks,
    package_manager: pm,
    test_commands: testCommands,
    build_commands: buildCommands,
    start_commands: startCommands,
    important_files: importantFiles,
    missing_files: missingFiles,
    dependency_summary: {
      runtime: pkg?.dependencies ? Object.keys(pkg.dependencies).length : 0,
      dev: pkg?.devDependencies ? Object.keys(pkg.devDependencies).length : 0,
      has_lockfile:
        has('pnpm-lock.yaml') ||
        has('yarn.lock') ||
        has('package-lock.json') ||
        has('bun.lockb') ||
        has('poetry.lock'),
    },
    timestamp: nowIso(),
  };
}

/** Lookup helper used by other modules. */
export async function hasFile(projectPath: string, relative: string): Promise<boolean> {
  return fileExists(path.join(projectPath, relative));
}
