import path from 'node:path';
import { readTextSafe, listFiles, fileExists } from '../../utils/fs.js';
import { readJsonSafe } from '../../utils/json.js';

export interface RepositoryScanFinding {
  kind: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  file: string;
  message: string;
}

export interface RepositoryScanResult {
  project_path: string;
  findings: RepositoryScanFinding[];
  suspicious_files: string[];
  suspicious_scripts: { file: string; script: string; reason: string }[];
  dependency_risk_count: number;
  has_lockfile: boolean;
}

const SUSPICIOUS_PATH_PATTERNS = [
  /^\.env(\..*)?$/i,
  /^id_rsa$/,
  /^id_ed25519$/,
  /credentials\.json$/i,
  /\.pem$/,
  /\.key$/,
  /\.aws[/\\]credentials/,
  /\.ssh[/\\]/,
];

const SUSPICIOUS_SCRIPT_PATTERNS: { re: RegExp; reason: string }[] = [
  { re: /curl\s+[^|]*\|\s*(sh|bash|zsh)/, reason: 'pipe-remote-to-shell' },
  { re: /wget\s+[^|]*\|\s*(sh|bash|zsh)/, reason: 'pipe-remote-to-shell' },
  { re: /\bnc(?:at)?\s+-/, reason: 'netcat invocation' },
  { re: /\beval\s+\$\(\s*(curl|wget)/, reason: 'eval of remote download' },
  { re: /\brm\s+-rf?\s+(\/|~)/, reason: 'rm -rf on /' },
  { re: /\bbase64\s+-d\s*\|\s*(sh|bash)/, reason: 'base64-pipe-to-shell' },
];

export async function scan(projectPath: string): Promise<RepositoryScanResult> {
  const files = await listFiles(projectPath);
  const findings: RepositoryScanFinding[] = [];
  const suspicious: string[] = [];
  for (const f of files) {
    if (SUSPICIOUS_PATH_PATTERNS.some((re) => re.test(f) || re.test(path.basename(f)))) {
      suspicious.push(f);
      findings.push({ kind: 'sensitive_file_present', severity: 'high', file: f, message: 'file looks like a secret store' });
    }
  }
  const suspiciousScripts: { file: string; script: string; reason: string }[] = [];
  const pkgPath = path.join(projectPath, 'package.json');
  if (fileExists(pkgPath)) {
    const pkg = await readJsonSafe<{ scripts?: Record<string, string> }>(pkgPath);
    if (pkg?.scripts) {
      for (const [k, v] of Object.entries(pkg.scripts)) {
        for (const { re, reason } of SUSPICIOUS_SCRIPT_PATTERNS) {
          if (re.test(v)) {
            suspiciousScripts.push({ file: 'package.json', script: k, reason });
            findings.push({ kind: 'suspicious_package_script', severity: 'high', file: 'package.json', message: `script '${k}' matches ${reason}` });
          }
        }
        if (/^(pre|post)?install$/.test(k) || k === 'prepare') {
          findings.push({ kind: 'lifecycle_script', severity: 'medium', file: 'package.json', message: `lifecycle script '${k}' present` });
        }
      }
    }
  }
  // Inspect a sample of small shell scripts and Makefile
  for (const f of files.filter((x) => x === 'Makefile' || x.endsWith('.sh'))) {
    const txt = await readTextSafe(path.join(projectPath, f));
    if (!txt) continue;
    for (const { re, reason } of SUSPICIOUS_SCRIPT_PATTERNS) {
      if (re.test(txt)) {
        suspiciousScripts.push({ file: f, script: f, reason });
        findings.push({ kind: 'suspicious_script', severity: 'high', file: f, message: reason });
      }
    }
  }
  const hasLock = fileExists(path.join(projectPath, 'pnpm-lock.yaml')) || fileExists(path.join(projectPath, 'package-lock.json')) || fileExists(path.join(projectPath, 'yarn.lock'));
  // dependency risk count comes from package.json dep names containing odd chars
  let depRisk = 0;
  if (fileExists(pkgPath)) {
    const pkg = await readJsonSafe<{ dependencies?: Record<string, string>; devDependencies?: Record<string, string> }>(pkgPath);
    const all = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
    for (const [n, v] of Object.entries(all)) {
      if (/^(git\+|file:|http:|https:)/.test(v)) depRisk++;
    }
  }
  return { project_path: projectPath, findings, suspicious_files: suspicious, suspicious_scripts: suspiciousScripts, dependency_risk_count: depRisk, has_lockfile: hasLock };
}
