/**
 * Common shape for every Demo2Project report.
 */
export interface ReportDocument {
  schema_version: string;
  type: string;
  title: string;
  generated_at: string;
  project_path_hash?: string;
  summary: string;
  findings: ReportFinding[];
  evidence_summary: string[];
  risk_summary: { level: 'low' | 'medium' | 'high' | 'critical'; label: string }[];
  recommendations: string[];
  next_steps: string[];
  limitations: string[];
  raw_refs: { name: string; path: string }[];
}

export interface ReportFinding {
  id: string;
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical' | 'info';
  description: string;
  evidence?: string;
}

export const REPORT_SCHEMA_VERSION = '0.0.8';

import crypto from 'node:crypto';

export function pathHash(projectPath: string): string {
  return crypto.createHash('sha256').update(projectPath).digest('hex').slice(0, 16);
}
