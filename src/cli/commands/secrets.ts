import path from 'node:path';
import { scanProject as scanProj, scanText } from '../../security/secrets/SecretScanner.js';
import { detectExposure } from '../../security/secrets/SecretExposureDetector.js';
import { readTextSafe, writeText, ensureDir } from '../../utils/fs.js';
import { writeJson } from '../../utils/json.js';
import { defaultSystemRoot, requireProject, flagString } from './_shared.js';

export async function secretsScan(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = requireProject(flags);
  if (!projectPath) return 2;
  const r = await scanProj(projectPath);
  process.stdout.write(JSON.stringify({ files_scanned: r.files_scanned, total: r.findings.length, high_risk: r.high_risk_count, findings: r.findings.slice(0, 50) }, null, 2) + '\n');
  return 0;
}

export async function secretsScanLog(flags: Record<string, string | boolean>): Promise<number> {
  const file = flagString(flags, 'file');
  if (!file) { process.stderr.write('--file required\n'); return 2; }
  const txt = await readTextSafe(file);
  if (txt === null) { process.stderr.write(`cannot read ${file}\n`); return 1; }
  const r = await scanText(txt, file);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function secretsReport(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = requireProject(flags);
  if (!projectPath) return 2;
  const scan = await scanProj(projectPath);
  const exposure = await detectExposure(projectPath);
  const dir = path.join(defaultSystemRoot(), 'reports', 'security');
  await ensureDir(dir);
  const data = { project_path: projectPath, scan_total: scan.findings.length, high_risk: scan.high_risk_count, exposure };
  const jsonPath = path.join(dir, 'secrets-report.json');
  const mdPath = path.join(dir, 'secrets-report.md');
  await writeJson(jsonPath, data);
  await writeText(mdPath, `# Secrets Report\n\nProject: ${projectPath}\nTotal findings: ${scan.findings.length}\nHigh risk: ${scan.high_risk_count}\nExposed surfaces: ${exposure.surfaces.length}\n`);
  process.stdout.write(JSON.stringify({ ...data, report: { json: jsonPath, md: mdPath } }, null, 2) + '\n');
  return 0;
}
