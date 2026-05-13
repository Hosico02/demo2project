import path from 'node:path';
import { promises as fs } from 'node:fs';
import { ensureDir, fileExists, readTextSafe, writeText } from '../../utils/fs.js';

export const WORKFLOWS = [
  'demo2project-preflight.yml',
  'demo2project-regression.yml',
  'demo2project-trust-report.yml',
  'demo2project-benchmark.yml',
  'demo2project-self-check.yml',
];

export interface InstallReport {
  installed: string[];
  skipped: string[];
  location: string;
  dry_run: boolean;
}

export async function install(systemRoot: string, projectPath: string, opts: { dryRun?: boolean } = {}): Promise<InstallReport> {
  const src = path.join(systemRoot, 'templates', 'github', 'workflows');
  const dst = path.join(projectPath, '.github', 'workflows');
  if (!opts.dryRun) await ensureDir(dst);
  const installed: string[] = [];
  const skipped: string[] = [];
  for (const f of WORKFLOWS) {
    const s = path.join(src, f);
    if (!fileExists(s)) { skipped.push(f); continue; }
    const content = await readTextSafe(s);
    if (content === null) { skipped.push(f); continue; }
    if (!opts.dryRun) await writeText(path.join(dst, f), content);
    installed.push(f);
  }
  return { installed, skipped, location: dst, dry_run: !!opts.dryRun };
}

export async function statusOf(projectPath: string): Promise<{ installed: string[]; missing: string[]; location: string }> {
  const dst = path.join(projectPath, '.github', 'workflows');
  let present: string[] = [];
  if (fileExists(dst)) {
    try { present = (await fs.readdir(dst)).filter((f) => f.endsWith('.yml')); } catch { /* ok */ }
  }
  const installed = present.filter((f) => WORKFLOWS.includes(f));
  const missing = WORKFLOWS.filter((f) => !installed.includes(f));
  return { installed, missing, location: dst };
}

export function explain(): { name: string; description: string }[] {
  return [
    { name: 'demo2project-preflight.yml', description: 'PR-time read-only analyze/gap/qa-preflight; same-repo only (skips fork PRs).' },
    { name: 'demo2project-regression.yml', description: 'Push-to-main QA regression spec runner.' },
    { name: 'demo2project-trust-report.yml', description: 'Weekly + on-demand trust report + audit verify; uploads artifact.' },
    { name: 'demo2project-benchmark.yml', description: 'On-demand benchmark suite across examples.' },
    { name: 'demo2project-self-check.yml', description: 'Build + test + self-check on every push/PR.' },
  ];
}
