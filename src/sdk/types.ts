export type SDKProfile = 'conservative' | 'balanced' | 'autonomous';

export interface SDKOptions {
  projectPath?: string;
  systemRoot?: string;
  profile?: SDKProfile;
}

export interface AnalysisResult {
  score: number;
  grade: string;
  language?: string;
  package_manager?: string;
  findings: number;
  blockers: number;
}

export interface GapResult {
  findings: { id: string; severity: string; message: string }[];
  blockers: { id: string; severity: string; message: string }[];
  recommendations: string[];
}

export interface PreflightResult {
  total_cases: number;
  active_cases: number;
}

export interface TrustResult {
  trust_score: number;
  open_incidents: number;
  audit_log_integrity_ok: boolean;
  recommendations: string[];
}
