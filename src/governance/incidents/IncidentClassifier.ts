import type { Incident, IncidentType } from './IncidentReport.js';
import type { RiskLevel } from '../../security/policy/PolicySchema.js';

export function classifySeverity(type: IncidentType, signal: { severity?: RiskLevel } = {}): RiskLevel {
  const critical: IncidentType[] = ['secret_exposure', 'unsafe_command_attempt', 'malicious_repo_detected', 'audit_log_tampering'];
  if (critical.includes(type)) return signal.severity === 'low' ? 'high' : (signal.severity ?? 'critical');
  return signal.severity ?? 'high';
}

export function shouldTriggerEmergencyStop(i: Incident): boolean {
  return i.severity === 'critical' || (i.severity === 'high' && ['unsafe_command_attempt', 'audit_log_tampering', 'self_modification_violation'].includes(i.type));
}
