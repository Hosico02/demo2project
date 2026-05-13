import { scanProject, explain } from '../../security/prompt-injection/PromptInjectionScanner.js';
import { requireProject, flagString } from './_shared.js';

export async function promptInjectionScan(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = requireProject(flags);
  if (!projectPath) return 2;
  const r = await scanProject(projectPath);
  process.stdout.write(JSON.stringify({ files_scanned: r.files_scanned, highest_severity: r.highest_severity, total: r.findings.length, findings: r.findings }, null, 2) + '\n');
  return 0;
}

export async function promptInjectionExplain(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = requireProject(flags);
  if (!projectPath) return 2;
  const id = flagString(flags, 'finding');
  if (!id) { process.stderr.write('--finding required\n'); return 2; }
  const r = await scanProject(projectPath);
  const f = r.findings.find((x) => x.id === id);
  if (!f) { process.stderr.write(`finding ${id} not found\n`); return 1; }
  process.stdout.write(JSON.stringify(explain(f), null, 2) + '\n');
  return 0;
}
