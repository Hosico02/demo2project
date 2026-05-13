import path from 'node:path';
import { readTextSafe } from '../utils/fs.js';
import type { ExtensionManifest, RequiredPermission } from './ExtensionManifest.js';

export interface ReviewFinding {
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  detail?: string;
}

export interface ReviewReport {
  extension: string;
  approved: boolean;
  requires_approval: boolean;
  findings: ReviewFinding[];
  recommended_action: 'install' | 'install_with_approval' | 'reject';
}

const HIGH_RISK_PERMS: RequiredPermission[] = ['modify_security_policy', 'network_access', 'write_project_files'];
const SUSPICIOUS_PATTERNS = [
  /child_process/,
  /\beval\s*\(/,
  /require\(\s*['"]http/,
  /fetch\s*\(/,
  /\.env/,
  /Function\(['"]return/,
];

export async function review(extDir: string, manifest: ExtensionManifest): Promise<ReviewReport> {
  const findings: ReviewFinding[] = [];
  if (manifest.risk_level === 'high') {
    findings.push({ severity: 'high', message: 'extension self-declares as high risk' });
  }
  for (const p of manifest.permissions_required) {
    if (HIGH_RISK_PERMS.includes(p)) {
      findings.push({ severity: 'high', message: `requests high-risk permission: ${p}` });
    }
  }
  const entryFile = path.join(extDir, manifest.entry);
  const code = await readTextSafe(entryFile);
  if (code) {
    for (const re of SUSPICIOUS_PATTERNS) {
      if (re.test(code)) findings.push({ severity: 'medium', message: `entry contains suspicious pattern: ${re}` });
    }
  } else {
    findings.push({ severity: 'critical', message: `cannot read entry file: ${manifest.entry}` });
  }
  const hasHigh = findings.some((f) => f.severity === 'high' || f.severity === 'critical');
  const requiresApproval = hasHigh || manifest.risk_level !== 'low';
  return {
    extension: manifest.name,
    approved: !hasHigh && manifest.risk_level === 'low',
    requires_approval: requiresApproval,
    findings,
    recommended_action: findings.some((f) => f.severity === 'critical') ? 'reject' : (requiresApproval ? 'install_with_approval' : 'install'),
  };
}
