import path from 'node:path';
import { readTextSafe, listFiles } from '../../utils/fs.js';
import { shortId } from '../../utils/time.js';
import type { SecretType } from './SecretPolicy.js';
import { HIGH_RISK_SECRETS } from './SecretPolicy.js';

export interface SecretFinding {
  id: string;
  type: SecretType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  file_path: string;
  line_hint: number;
  redacted_preview: string;
  confidence: 'low' | 'medium' | 'high';
  exposure_risk: 'low' | 'medium' | 'high';
  recommended_action: string;
  evidence_ids: string[];
}

interface Pattern {
  type: SecretType;
  re: RegExp;
  confidence: 'low' | 'medium' | 'high';
  severity: SecretFinding['severity'];
}

const PATTERNS: Pattern[] = [
  { type: 'api_key', re: /\bAKIA[0-9A-Z]{16}\b/, confidence: 'high', severity: 'critical' },
  { type: 'access_token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/, confidence: 'high', severity: 'critical' },
  { type: 'api_key', re: /\bsk-ant-[A-Za-z0-9_\-]{20,}\b/, confidence: 'high', severity: 'critical' },
  { type: 'api_key', re: /\bsk-[A-Za-z0-9]{20,}\b/, confidence: 'medium', severity: 'high' },
  { type: 'private_key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, confidence: 'high', severity: 'critical' },
  { type: 'jwt', re: /\beyJ[A-Za-z0-9_\-]+\.eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\b/, confidence: 'high', severity: 'high' },
  { type: 'database_url', re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s'"<>]+/i, confidence: 'high', severity: 'high' },
  { type: 'password', re: /\b(password|passwd|pwd)\s*[:=]\s*['"][^'"\s]{6,}['"]/i, confidence: 'medium', severity: 'high' },
  { type: 'env_value', re: /\b(API[_-]?KEY|SECRET|TOKEN|ACCESS[_-]?KEY)\s*=\s*[A-Za-z0-9_\-+/=]{12,}/i, confidence: 'medium', severity: 'high' },
  { type: 'webhook_secret', re: /\bwhsec_[A-Za-z0-9]{20,}\b/, confidence: 'high', severity: 'high' },
  { type: 'oauth_secret', re: /\bclient[_-]?secret\s*[:=]\s*['"][^'"\s]{12,}['"]/i, confidence: 'medium', severity: 'high' },
  { type: 'email_address', re: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/, confidence: 'high', severity: 'low' },
  { type: 'absolute_local_path', re: /(?<![A-Za-z0-9_])\/Users\/[A-Za-z0-9_\-]+/, confidence: 'high', severity: 'low' },
  { type: 'private_repo_url', re: /\bgit@[A-Za-z0-9.\-]+:[A-Za-z0-9_\-./]+\.git\b/, confidence: 'medium', severity: 'medium' },
];

const SCAN_EXTS = ['.md', '.txt', '.json', '.yaml', '.yml', '.env', '.env.example', '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.rb', '.cfg', '.ini', '.toml', '.sh', 'Makefile'];

function shouldScan(rel: string): boolean {
  const base = path.basename(rel);
  if (base === 'Makefile') return true;
  return SCAN_EXTS.some((ext) => rel.endsWith(ext));
}

function preview(raw: string): string {
  if (raw.length <= 8) return '***';
  return raw.slice(0, 4) + '***' + raw.slice(-2);
}

export interface SecretScanReport {
  project_path: string;
  files_scanned: number;
  findings: SecretFinding[];
  high_risk_count: number;
}

export async function scanProject(projectPath: string, maxFiles = 800): Promise<SecretScanReport> {
  const all = await listFiles(projectPath, maxFiles);
  const targets = all.filter(shouldScan);
  const findings: SecretFinding[] = [];
  for (const rel of targets) {
    const txt = await readTextSafe(path.join(projectPath, rel));
    if (!txt) continue;
    const lines = txt.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      for (const p of PATTERNS) {
        const m = line.match(p.re);
        if (m) {
          findings.push({
            id: shortId('sec'),
            type: p.type,
            severity: p.severity,
            file_path: rel,
            line_hint: i + 1,
            redacted_preview: preview(m[0]),
            confidence: p.confidence,
            exposure_risk: HIGH_RISK_SECRETS.includes(p.type) ? 'high' : 'medium',
            recommended_action: HIGH_RISK_SECRETS.includes(p.type) ? 'rotate immediately; move to secrets manager' : 'review and redact in published artifacts',
            evidence_ids: [],
          });
        }
      }
    }
  }
  return { project_path: projectPath, files_scanned: targets.length, findings, high_risk_count: findings.filter((f) => f.exposure_risk === 'high').length };
}

export async function scanText(text: string, file = '(stdin)'): Promise<SecretScanReport> {
  const findings: SecretFinding[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const p of PATTERNS) {
      const m = line.match(p.re);
      if (m) {
        findings.push({
          id: shortId('sec'),
          type: p.type,
          severity: p.severity,
          file_path: file,
          line_hint: i + 1,
          redacted_preview: preview(m[0]),
          confidence: p.confidence,
          exposure_risk: HIGH_RISK_SECRETS.includes(p.type) ? 'high' : 'medium',
          recommended_action: HIGH_RISK_SECRETS.includes(p.type) ? 'rotate immediately' : 'review',
          evidence_ids: [],
        });
      }
    }
  }
  return { project_path: file, files_scanned: 1, findings, high_risk_count: findings.filter((f) => f.exposure_risk === 'high').length };
}
