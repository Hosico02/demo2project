import path from 'node:path';
import { fileExists, readTextSafe } from '../../utils/fs.js';

export interface UXCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface UXQualityReport {
  generated_at: string;
  ok: boolean;
  checks: UXCheck[];
  warnings: string[];
}

export async function check(systemRoot: string): Promise<UXQualityReport> {
  const checks: UXCheck[] = [];
  const readme = await readTextSafe(path.join(systemRoot, 'README.md'));
  checks.push({ name: 'README has Quickstart', ok: !!readme && /quickstart/i.test(readme) });
  checks.push({ name: 'README has Phase 7/Phase 8 mention', ok: !!readme && (/Phase\s*7/.test(readme) || /Phase\s*8/.test(readme)) });
  checks.push({ name: 'doctor command exists', ok: fileExists(path.join(systemRoot, 'src', 'cli', 'commands', 'doctor.ts')) });
  checks.push({ name: 'next command exists', ok: fileExists(path.join(systemRoot, 'src', 'cli', 'commands', 'next.ts')) });
  checks.push({ name: 'quickstart command exists', ok: fileExists(path.join(systemRoot, 'src', 'cli', 'commands', 'quickstart.ts')) });
  checks.push({ name: 'error catalog exists', ok: fileExists(path.join(systemRoot, 'src', 'product', 'diagnostics', 'ErrorCatalog.ts')) });
  checks.push({ name: 'docs:check command exists', ok: fileExists(path.join(systemRoot, 'src', 'cli', 'commands', 'docs.ts')) });
  checks.push({ name: 'troubleshoot doc exists', ok: fileExists(path.join(systemRoot, 'docs', 'guides', 'troubleshoot.md')) });
  const ok = checks.every((c) => c.ok);
  return {
    generated_at: new Date().toISOString(),
    ok,
    checks,
    warnings: ok ? [] : ['some UX checks failed — see `ux:check`'],
  };
}
