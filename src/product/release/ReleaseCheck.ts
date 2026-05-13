import path from 'node:path';
import { fileExists, readTextSafe } from '../../utils/fs.js';
import { readJsonSafe } from '../../utils/json.js';

export interface ReleaseCheckResult {
  generated_at: string;
  ok: boolean;
  checks: { name: string; ok: boolean; detail?: string; remediation?: string }[];
  summary: string;
}

export async function check(systemRoot: string): Promise<ReleaseCheckResult> {
  const checks: ReleaseCheckResult['checks'] = [];
  const pkg = await readJsonSafe<{ name?: string; version?: string; bin?: unknown; exports?: unknown; license?: string }>(path.join(systemRoot, 'package.json'));
  checks.push({ name: 'package.json present', ok: !!pkg, remediation: 'add a package.json' });
  checks.push({ name: 'package.name', ok: !!pkg?.name, detail: pkg?.name, remediation: 'set "name"' });
  checks.push({ name: 'package.version', ok: !!pkg?.version, detail: pkg?.version, remediation: 'set "version" (semver)' });
  checks.push({ name: 'package.bin', ok: !!pkg?.bin, detail: JSON.stringify(pkg?.bin), remediation: 'declare "bin" so demo2project is on PATH after install' });
  checks.push({ name: 'package.license', ok: !!pkg?.license, detail: pkg?.license, remediation: 'set "license"' });
  checks.push({ name: 'README present', ok: fileExists(path.join(systemRoot, 'README.md')) });
  checks.push({ name: 'CHANGELOG present', ok: fileExists(path.join(systemRoot, 'CHANGELOG.md')), remediation: 'add CHANGELOG.md (we now generate one in Phase 8)' });
  checks.push({ name: 'tsconfig present', ok: fileExists(path.join(systemRoot, 'tsconfig.json')) });
  checks.push({ name: 'dist/cli built', ok: fileExists(path.join(systemRoot, 'dist', 'cli', 'index.js')), remediation: 'run `pnpm build`' });
  checks.push({ name: 'type declarations', ok: fileExists(path.join(systemRoot, 'dist', 'sdk', 'index.d.ts')) || fileExists(path.join(systemRoot, 'dist', 'cli', 'index.d.ts')), remediation: 'tsc emits .d.ts; check tsconfig' });
  checks.push({ name: 'LICENSE present', ok: fileExists(path.join(systemRoot, 'LICENSE')) || fileExists(path.join(systemRoot, 'LICENSE.md')), remediation: 'add a LICENSE file' });
  const ok = checks.every((c) => c.ok);
  const failed = checks.filter((c) => !c.ok).length;
  return {
    generated_at: new Date().toISOString(),
    ok,
    checks,
    summary: ok ? 'Release-ready (all checks pass).' : `${failed} check(s) failing.`,
  };
}

export async function notes(systemRoot: string, version: string): Promise<string> {
  const changelog = await readTextSafe(path.join(systemRoot, 'CHANGELOG.md'));
  if (!changelog) return `# ${version}\n\n(no CHANGELOG.md found)\n`;
  const section = changelog.split(`## ${version}`)[1];
  if (!section) return `# ${version}\n\n(no section for ${version} in CHANGELOG.md)\n`;
  return `# ${version}\n${section.split(/^## /m)[0]}`;
}
