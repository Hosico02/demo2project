import path from 'node:path';
import { isInsideDir, abs } from '../../utils/paths.js';

const SECRET_FILES = [
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  '.npmrc',
  '.pypirc',
  'id_rsa',
  'id_ed25519',
  'credentials.json',
  'service-account.json',
];

const SECRET_DIRS = [
  '.ssh',
  '.aws',
  '.gnupg',
];

const HIGH_RISK_DEMO2PROJECT_PATHS = [
  'src/core/safety.ts',
  'src/core/redaction.ts',
  'src/core/approvalGate.ts',
  'src/core/autonomyPolicy.ts',
  'config/security-policy.json',
  'config/approval-policy.json',
  'config/autonomy-policy.json',
  'qa/specs/',
  'templates/claude/hooks/',
];

export interface FileCheck {
  allowed: boolean;
  reason: string;
  requires_approval?: boolean;
}

export function isSecretPath(p: string): boolean {
  const base = path.basename(p);
  if (SECRET_FILES.includes(base)) return true;
  if (/^\.env\./.test(base)) return true;
  for (const d of SECRET_DIRS) {
    if (p.includes(`/${d}/`) || p.endsWith(`/${d}`) || p.startsWith(`${d}/`)) return true;
  }
  return false;
}

export function isHighRiskDemo2ProjectPath(rel: string): boolean {
  return HIGH_RISK_DEMO2PROJECT_PATHS.some((p) => rel === p || rel.startsWith(p));
}

export function checkRead(projectPath: string, target: string): FileCheck {
  const absTarget = abs(target);
  const absProject = abs(projectPath);
  if (!isInsideDir(absTarget, absProject) && absTarget !== absProject) {
    return { allowed: false, reason: 'path outside project boundary' };
  }
  if (isSecretPath(target)) {
    return { allowed: false, reason: 'secret-class file', requires_approval: true };
  }
  return { allowed: true, reason: 'within project, not secret' };
}

export function checkWrite(projectPath: string, target: string): FileCheck {
  const absTarget = abs(target);
  const absProject = abs(projectPath);
  if (!isInsideDir(absTarget, absProject) && absTarget !== absProject) {
    return { allowed: false, reason: 'write outside project denied' };
  }
  if (isSecretPath(target)) {
    return { allowed: false, reason: 'cannot write secret-class file', requires_approval: true };
  }
  const rel = path.relative(absProject, absTarget);
  if (isHighRiskDemo2ProjectPath(rel)) {
    return { allowed: false, reason: 'high-risk Demo2Project core path', requires_approval: true };
  }
  return { allowed: true, reason: 'normal write inside project' };
}

export function checkDelete(projectPath: string, target: string): FileCheck {
  const inProject = checkWrite(projectPath, target);
  if (!inProject.allowed) return inProject;
  return { allowed: false, reason: 'deletion always requires approval', requires_approval: true };
}
