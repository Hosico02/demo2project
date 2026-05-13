import path from 'node:path';
import { promises as fs } from 'node:fs';
import { readJsonSafe, writeJson } from '../../utils/json.js';
import { ensureDir } from '../../utils/fs.js';
import { stateDir } from '../../utils/paths.js';
import { nowIso } from '../../utils/time.js';
import type { TrustLevel } from './TrustLevel.js';
import { scan as scanRepo } from './UntrustedRepositoryScanner.js';
import type { RepositoryScanResult } from './UntrustedRepositoryScanner.js';

export interface TrustRecord {
  project_path: string;
  trust_level: TrustLevel;
  reasons: string[];
  set_at: string;
  set_by: string;
  scan?: RepositoryScanResult;
}

function trustFile(projectPath: string): string {
  return path.join(stateDir(projectPath), 'security', 'trust.json');
}

export async function evaluateTrust(projectPath: string): Promise<TrustRecord> {
  const existing = await readJsonSafe<TrustRecord>(trustFile(projectPath));
  if (existing && existing.set_by === 'user') return existing;
  const result = await scanRepo(projectPath);
  const high = result.findings.filter((f) => f.severity === 'high' || f.severity === 'critical');
  const med = result.findings.filter((f) => f.severity === 'medium');
  let level: TrustLevel = 'partially_trusted';
  const reasons: string[] = [];
  if (high.length > 0) {
    level = 'untrusted';
    reasons.push(`${high.length} high-severity finding(s)`);
  } else if (med.length > 0) {
    level = 'partially_trusted';
    reasons.push(`${med.length} medium-severity finding(s)`);
  }
  if (result.suspicious_scripts.length > 0) {
    level = 'untrusted';
    reasons.push(`${result.suspicious_scripts.length} suspicious script(s)`);
  }
  if (result.findings.length === 0) {
    reasons.push('no risk indicators found');
  }
  const rec: TrustRecord = { project_path: projectPath, trust_level: level, reasons, set_at: nowIso(), set_by: 'system', scan: result };
  await ensureDir(path.dirname(trustFile(projectPath)));
  await writeJson(trustFile(projectPath), rec);
  return rec;
}

export async function setTrust(projectPath: string, level: TrustLevel, by: string, reason: string): Promise<TrustRecord> {
  const rec: TrustRecord = { project_path: projectPath, trust_level: level, reasons: [reason], set_at: nowIso(), set_by: by };
  await ensureDir(path.dirname(trustFile(projectPath)));
  await writeJson(trustFile(projectPath), rec);
  return rec;
}

export async function readTrust(projectPath: string): Promise<TrustRecord | null> {
  return readJsonSafe<TrustRecord>(trustFile(projectPath));
}

export async function quarantine(projectPath: string, reason: string): Promise<TrustRecord> {
  return setTrust(projectPath, 'quarantined', 'user', reason);
}

export async function unquarantine(projectPath: string, level: TrustLevel = 'partially_trusted'): Promise<TrustRecord | null> {
  const existing = await readTrust(projectPath);
  if (!existing) return null;
  return setTrust(projectPath, level, 'user', 'unquarantined');
}

export function isUntrusted(rec: TrustRecord | null): boolean {
  if (!rec) return true;
  return rec.trust_level === 'untrusted' || rec.trust_level === 'quarantined';
}

void fs;
