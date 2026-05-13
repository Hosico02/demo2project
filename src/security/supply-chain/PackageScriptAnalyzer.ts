import path from 'node:path';
import { readJsonSafe } from '../../utils/json.js';
import { fileExists } from '../../utils/fs.js';

export interface ScriptFinding {
  script: string;
  body: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  reasons: string[];
}

const LIFECYCLE = new Set(['preinstall', 'install', 'postinstall', 'prepare', 'preprepare', 'postprepare']);

const DANGER_PATTERNS: { re: RegExp; reason: string; severity: ScriptFinding['severity'] }[] = [
  { re: /curl\s+[^|]*\|\s*(sh|bash|zsh)/, reason: 'pipe remote to shell', severity: 'critical' },
  { re: /wget\s+[^|]*\|\s*(sh|bash|zsh)/, reason: 'pipe remote to shell', severity: 'critical' },
  { re: /\bnc(?:at)?\s+-/, reason: 'netcat invocation', severity: 'high' },
  { re: /\beval\s+\$\(\s*(curl|wget)/, reason: 'eval of remote download', severity: 'critical' },
  { re: /\brm\s+-rf?\s+(\/|~|\$HOME)/, reason: 'rm -rf root/home', severity: 'critical' },
  { re: /\bsudo\b/, reason: 'sudo escalation', severity: 'critical' },
  { re: /\bbase64\s+-d\s*\|\s*(sh|bash)/, reason: 'base64-pipe-to-shell', severity: 'critical' },
  { re: /\bchmod\s+\+x\s+.*\/tmp\//, reason: 'chmod +x on /tmp file', severity: 'high' },
  { re: /\b(scp|rsync|ssh)\b.*@/, reason: 'remote copy / ssh', severity: 'medium' },
];

export interface PackageScriptReport {
  project_path: string;
  lifecycle_scripts: string[];
  findings: ScriptFinding[];
  has_network_download: boolean;
}

export async function analyze(projectPath: string): Promise<PackageScriptReport> {
  const pkgPath = path.join(projectPath, 'package.json');
  if (!fileExists(pkgPath)) return { project_path: projectPath, lifecycle_scripts: [], findings: [], has_network_download: false };
  const pkg = await readJsonSafe<{ scripts?: Record<string, string> }>(pkgPath);
  const scripts = pkg?.scripts ?? {};
  const findings: ScriptFinding[] = [];
  const lifecycle: string[] = [];
  let netDownload = false;
  for (const [name, body] of Object.entries(scripts)) {
    const reasons: string[] = [];
    let severity: ScriptFinding['severity'] = 'low';
    if (LIFECYCLE.has(name)) {
      lifecycle.push(name);
      reasons.push('lifecycle hook');
      severity = 'medium';
    }
    for (const p of DANGER_PATTERNS) {
      if (p.re.test(body)) {
        reasons.push(p.reason);
        severity = severityMax(severity, p.severity);
      }
    }
    if (/\b(curl|wget|fetch)\b/.test(body)) netDownload = true;
    if (reasons.length > 0) findings.push({ script: name, body, severity, reasons });
  }
  return { project_path: projectPath, lifecycle_scripts: lifecycle, findings, has_network_download: netDownload };
}

function severityMax(a: ScriptFinding['severity'], b: ScriptFinding['severity']): ScriptFinding['severity'] {
  const order = { low: 1, medium: 2, high: 3, critical: 4 } as const;
  return order[a] >= order[b] ? a : b;
}
