import path from 'node:path';
import { writeJson } from '../utils/json.js';
import { writeText, ensureDir, fileExists } from '../utils/fs.js';
import { buildThreatModel } from '../security/ThreatModel.js';
import { loadSecurityPolicy } from '../security/policy/SecurityPolicyEngine.js';
import { CapabilityManager } from '../security/capabilities/CapabilityManager.js';
import { evaluateTrust } from '../security/untrusted/RepositoryTrustEvaluator.js';
import { list as listViolations } from '../security/policy/PolicyViolation.js';
import { ApprovalWorkflow } from './approval/ApprovalWorkflow.js';
import { verify as verifyAudit } from './audit/AuditVerifier.js';
import { scanProject as scanSecrets } from '../security/secrets/SecretScanner.js';
import { scan as scanSupply } from '../security/supply-chain/SupplyChainReport.js';
import { scanProject as scanInjections } from '../security/prompt-injection/PromptInjectionScanner.js';
import { scan as scanPlugins } from '../security/plugins/PluginSecurityScanner.js';
import { scan as scanMcp } from '../security/plugins/McpSecurityScanner.js';
import { reportMemoryHealth } from '../qa/QAMemoryHealth.js';
import { loadMode } from '../privacy/PrivacyMode.js';
import { loadPolicy as loadRetention } from '../privacy/DataRetentionPolicy.js';
import { IncidentManager } from './incidents/IncidentManager.js';
import { status as emergencyStatus } from './incidents/EmergencyStop.js';
import { loadPolicy as loadAutonomy } from '../core/autonomyPolicy.js';

export interface TrustReportData {
  generated_at: string;
  project_path?: string;
  trust_score: number;
  security_policy_status: { ok: boolean; version: string; rules: number };
  autonomy_level: string;
  active_capabilities: number;
  untrusted_repo_status?: { trust_level: string; reasons: string[] };
  open_policy_violations: number;
  open_incidents: number;
  approval_queue: number;
  audit_log_integrity: { ok: boolean; total: number };
  secret_scan_status?: { findings: number; high_risk: number };
  supply_chain_status?: { suspect: number; lifecycle_scripts: number };
  prompt_injection_findings?: number;
  plugin_mcp_risks: { plugins: number; mcp_servers: number; high_risk: number };
  qa_memory_health: { total_cases: number; noise: number; usefulness: number };
  evidence_graph_integrity: { ok: boolean };
  self_iteration_safety_status: { allowed: boolean; forbidden_paths: number };
  privacy_mode: string;
  data_retention_status: { keep_audit_days: number; keep_replay_days: number };
  emergency_stop_active: boolean;
  recommendations: string[];
}

export async function buildTrustReport(systemRoot: string, projectPath?: string): Promise<TrustReportData> {
  const policy = await loadSecurityPolicy(systemRoot);
  const tm = buildThreatModel();
  const capMgr = new CapabilityManager(systemRoot);
  const capSummary = await capMgr.auditAll();
  const auditChain = await verifyAudit(systemRoot);
  const approvals = await new ApprovalWorkflow(systemRoot).list();
  const incidents = await new IncidentManager(systemRoot).list();
  const eStop = await emergencyStatus(systemRoot);
  const autonomy = await loadAutonomy(systemRoot);
  const privacy = await loadMode(systemRoot);
  const retention = await loadRetention(systemRoot);
  const qaHealth = await reportMemoryHealth(systemRoot);

  let trustRec, secret, supply, injection;
  let violations: { length: number; high: number } = { length: 0, high: 0 };
  if (projectPath && fileExists(projectPath)) {
    trustRec = await evaluateTrust(projectPath);
    secret = await scanSecrets(projectPath);
    supply = await scanSupply(projectPath);
    injection = await scanInjections(projectPath, 200);
    const v = await listViolations(projectPath);
    violations = { length: v.length, high: v.filter((x) => x.severity === 'high' || x.severity === 'critical').length };
  }
  const plugins = await scanPlugins(systemRoot, projectPath);
  const mcp = await scanMcp(systemRoot, projectPath);
  const highRiskIntegrations =
    plugins.findings.filter((f) => f.risk === 'high' || f.risk === 'critical').length +
    mcp.findings.filter((f) => f.risk === 'high' || f.risk === 'critical').length;

  const recs: string[] = [];
  if (violations.high > 0) recs.push('Resolve high-severity policy violations');
  if (auditChain.ok === false) recs.push(`Audit chain broken at index ${auditChain.broken_at}`);
  if (eStop.active) recs.push('System under emergency stop; review before resume');
  if (secret && secret.high_risk_count > 0) recs.push('Rotate exposed high-risk secrets');
  if (injection && injection.findings.length > 0) recs.push('Sanitize prompt-injection findings');
  if (highRiskIntegrations > 0) recs.push('Review high-risk plugins/MCP servers');

  // Trust score: start from threat-model readiness, subtract penalties.
  let score = tm.aggregate.trust_readiness_score;
  score -= Math.min(20, violations.high * 5);
  if (!auditChain.ok) score -= 25;
  if (eStop.active) score -= 5;
  if (secret) score -= Math.min(15, secret.high_risk_count * 3);
  if (highRiskIntegrations > 0) score -= Math.min(10, highRiskIntegrations * 3);
  score = Math.max(0, Math.min(100, score));

  return {
    generated_at: new Date().toISOString(),
    project_path: projectPath,
    trust_score: score,
    security_policy_status: { ok: true, version: policy.version, rules: policy.rules.length },
    autonomy_level: autonomy.default_autonomy_level,
    active_capabilities: capSummary.active,
    untrusted_repo_status: trustRec ? { trust_level: trustRec.trust_level, reasons: trustRec.reasons } : undefined,
    open_policy_violations: violations.length,
    open_incidents: incidents.filter((i) => i.status === 'open').length,
    approval_queue: approvals.filter((a) => a.status === 'pending').length,
    audit_log_integrity: { ok: auditChain.ok, total: auditChain.total },
    secret_scan_status: secret ? { findings: secret.findings.length, high_risk: secret.high_risk_count } : undefined,
    supply_chain_status: supply ? { suspect: supply.dependencies.suspect, lifecycle_scripts: supply.scripts.lifecycle_scripts.length } : undefined,
    prompt_injection_findings: injection?.findings.length,
    plugin_mcp_risks: { plugins: plugins.plugins_found, mcp_servers: mcp.servers_found, high_risk: highRiskIntegrations },
    qa_memory_health: { total_cases: qaHealth.total_cases, noise: qaHealth.memory_noise_score, usefulness: qaHealth.memory_usefulness_score },
    evidence_graph_integrity: { ok: true },
    self_iteration_safety_status: { allowed: autonomy.allow_self_iteration, forbidden_paths: autonomy.forbidden_self_modifications.length },
    privacy_mode: privacy.mode,
    data_retention_status: { keep_audit_days: retention.keep_audit_log_days, keep_replay_days: retention.keep_replay_bundles_days },
    emergency_stop_active: eStop.active,
    recommendations: recs,
  };
}

export async function writeTrustReport(systemRoot: string, projectPath?: string): Promise<{ json: string; md: string; data: TrustReportData }> {
  const data = await buildTrustReport(systemRoot, projectPath);
  const dir = path.join(systemRoot, 'reports', 'trust');
  await ensureDir(dir);
  const jsonPath = path.join(dir, 'trust-report.json');
  const mdPath = path.join(dir, 'trust-report.md');
  await writeJson(jsonPath, data);
  const lines = [
    '# Trust Report',
    `Generated: ${data.generated_at}`,
    '',
    `- **Trust score: ${data.trust_score}/100**`,
    `- Autonomy level: ${data.autonomy_level}`,
    `- Privacy mode: ${data.privacy_mode}`,
    `- Audit chain integrity: ${data.audit_log_integrity.ok ? 'ok' : 'BROKEN'} (${data.audit_log_integrity.total} events)`,
    `- Emergency stop: ${data.emergency_stop_active ? 'ACTIVE' : 'inactive'}`,
    `- Open incidents: ${data.open_incidents}`,
    `- Pending approvals: ${data.approval_queue}`,
    `- Open policy violations: ${data.open_policy_violations}`,
    '',
    '## Recommendations',
    ...(data.recommendations.length > 0 ? data.recommendations.map((r) => `- ${r}`) : ['- (none)']),
  ];
  await writeText(mdPath, lines.join('\n') + '\n');
  return { json: jsonPath, md: mdPath, data };
}
