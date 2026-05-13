import path from 'node:path';
import { readTextSafe } from '../../utils/fs.js';
import { promises as fs } from 'node:fs';

export interface HookFinding {
  file: string;
  invokes_shell: boolean;
  reads_secrets: boolean;
  modifies_policy: boolean;
  uploads_data: boolean;
  risk: 'low' | 'medium' | 'high' | 'critical';
  reasons: string[];
}

export interface HookScanReport {
  scanned_dirs: string[];
  hooks_found: number;
  findings: HookFinding[];
}

const SHELL_PATTERN = /\b(child_process|execSync|spawn|exec\()/;
const SECRET_PATTERN = /\b(\.env|id_rsa|credentials)/;
const POLICY_PATTERN = /(security-policy|approval-policy|autonomy-policy|verification.gate|redaction\.ts)/;
const UPLOAD_PATTERN = /(curl|wget|fetch\(|nc\b)/;

async function walkScripts(dir: string, out: string[]): Promise<void> {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walkScripts(full, out);
    else if (/\.(ts|mjs|js|sh)$/.test(e.name)) out.push(full);
  }
}

export async function scan(systemRoot: string, projectPath?: string): Promise<HookScanReport> {
  const roots = [
    path.join(systemRoot, 'templates', 'claude', 'hooks'),
    projectPath ? path.join(projectPath, '.claude', 'hooks') : null,
    path.join(process.env.HOME ?? '', '.claude', 'hooks'),
  ].filter(Boolean) as string[];
  const files: string[] = [];
  const scanned: string[] = [];
  for (const r of roots) {
    scanned.push(r);
    await walkScripts(r, files);
  }
  const findings: HookFinding[] = [];
  for (const f of files) {
    const txt = await readTextSafe(f);
    if (!txt) continue;
    const reasons: string[] = [];
    let risk: HookFinding['risk'] = 'low';
    const shell = SHELL_PATTERN.test(txt);
    const sec = SECRET_PATTERN.test(txt);
    const pol = POLICY_PATTERN.test(txt);
    const upl = UPLOAD_PATTERN.test(txt);
    if (shell) { reasons.push('uses child_process / shell exec'); risk = 'medium'; }
    if (sec) { reasons.push('references secret files'); risk = 'high'; }
    if (pol) { reasons.push('touches policy files'); risk = 'high'; }
    if (upl) { reasons.push('contains network upload pattern'); risk = 'critical'; }
    findings.push({ file: path.relative(systemRoot, f), invokes_shell: shell, reads_secrets: sec, modifies_policy: pol, uploads_data: upl, risk, reasons });
  }
  return { scanned_dirs: scanned, hooks_found: findings.length, findings };
}
