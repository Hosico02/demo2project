import type { PackageScriptReport } from './PackageScriptAnalyzer.js';

export interface InstallScriptDecision {
  allowed: boolean;
  reason: string;
  requires_approval: boolean;
}

export function evaluateInstallScripts(report: PackageScriptReport, trustLevel: 'trusted' | 'partially_trusted' | 'untrusted' | 'quarantined'): InstallScriptDecision {
  if (trustLevel === 'untrusted' || trustLevel === 'quarantined') {
    if (report.lifecycle_scripts.length > 0) {
      return { allowed: false, reason: `${report.lifecycle_scripts.length} lifecycle script(s) present in untrusted repo`, requires_approval: false };
    }
  }
  if (report.findings.some((f) => f.severity === 'critical')) {
    return { allowed: false, reason: 'critical pattern in package script', requires_approval: false };
  }
  if (report.lifecycle_scripts.length > 0) {
    return { allowed: false, reason: 'lifecycle scripts present', requires_approval: true };
  }
  return { allowed: true, reason: 'no lifecycle scripts; no critical patterns', requires_approval: false };
}
