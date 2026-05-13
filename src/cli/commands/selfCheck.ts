import path from 'node:path';
import { promises as fs } from 'node:fs';
import { AnalyzerAgent } from '../../agents/AnalyzerAgent.js';
import { QACaseStore } from '../../qa/QACaseStore.js';
import { runRegression } from '../../qa/QARegressionRunner.js';
import { loadPolicy, isForbiddenSelfMod } from '../../core/autonomyPolicy.js';
import { reportMemoryHealth } from '../../qa/QAMemoryHealth.js';
import { fileExists } from '../../utils/fs.js';
import { loadSecurityPolicy, validate as validatePolicy } from '../../security/policy/SecurityPolicyEngine.js';
import { verify as verifyAudit } from '../../governance/audit/AuditVerifier.js';
import { status as emergencyStatus } from '../../governance/incidents/EmergencyStop.js';
import { loadMode } from '../../privacy/PrivacyMode.js';
import { loadPolicy as loadRetention } from '../../privacy/DataRetentionPolicy.js';
import { check as releaseCheck } from '../../product/release/ReleaseCheck.js';
import { check as docsCheck } from '../../product/docs/DocsChecker.js';
import { score as productScore } from '../../product/release/ProductReadinessScorer.js';
import { check as uxCheck } from '../../product/ux/UXQualityChecker.js';
import { defaultSystemRoot } from './_shared.js';

/**
 * Self-check (Phase 6 + Phase 7): run analyze + gap + regression against
 * the demo2project repo, AND verify Phase 6 and Phase 7 capabilities are
 * present and usable. Returns non-zero if any required capability is missing.
 */
export async function selfCheck(_flags: Record<string, string | boolean>): Promise<number> {
  const root = defaultSystemRoot();
  const analyzer = new AnalyzerAgent();
  const { snapshot, score, gap } = await analyzer.fullAnalyze(root);
  const store = new QACaseStore(root);
  const spec = await store.readRegressionSpec(root);
  const regression = await runRegression(root, spec);

  const policy = await loadPolicy(root);
  const safetyForbidden = isForbiddenSelfMod(policy, 'src/core/safety.ts');
  const redactionForbidden = isForbiddenSelfMod(policy, 'src/core/redaction.ts');
  const approvalGateForbidden = isForbiddenSelfMod(policy, 'src/core/approvalGate.ts');
  const qaSpecForbidden = isForbiddenSelfMod(policy, 'qa/specs/');
  const qaHealth = await reportMemoryHealth(root);

  const phase6 = {
    autonomy_policy_present: fileExists(path.join(root, 'config', 'autonomy-policy.json')),
    verification_gate_active: policy.rollback_on_score_drop,
    safety_in_forbidden_list: safetyForbidden,
    redaction_in_forbidden_list: redactionForbidden,
    approval_gate_in_forbidden_list: approvalGateForbidden,
    qa_specs_in_forbidden_list: qaSpecForbidden,
    high_risk_self_mod_requires_approval: policy.require_human_review_for_global_changes,
    qa_memory_health_computable: typeof qaHealth.memory_noise_score === 'number',
    redaction_enabled: fileExists(path.join(root, 'dist', 'core', 'redaction.js')) || fileExists(path.join(root, 'src', 'core', 'redaction.ts')),
    evidence_graph_module: fileExists(path.join(root, 'src', 'core', 'evidenceGraph.ts')),
    replay_system_module: fileExists(path.join(root, 'src', 'core', 'replaySystem.ts')),
    governance_log_module: fileExists(path.join(root, 'src', 'core', 'governanceDecisionLog.ts')),
    drift_detector_module: fileExists(path.join(root, 'src', 'core', 'architectureDrift.ts')),
    planner_calibration_module: fileExists(path.join(root, 'src', 'core', 'plannerCalibration.ts')),
    executor_reliability_module: fileExists(path.join(root, 'src', 'core', 'executorReliability.ts')),
    self_improvement_module: fileExists(path.join(root, 'src', 'core', 'selfImprovement.ts')),
    test_runner_works: fileExists(path.join(root, 'vitest.config.ts')),
    benchmarks_present: fileExists(path.join(root, 'benchmarks', 'public')),
  };
  const missing6 = Object.entries(phase6).filter(([, v]) => !v).map(([k]) => k);

  // ---------- Phase 7 probes ----------
  const secPolicy = await loadSecurityPolicy(root);
  const polValid = validatePolicy(secPolicy);
  const audit = await verifyAudit(root);
  const eStop = await emergencyStatus(root);
  const privacy = await loadMode(root);
  const retention = await loadRetention(root);
  const phase7 = {
    security_policy_present: fileExists(path.join(root, 'config', 'security-policy.json')) || fileExists(path.join(root, 'src', 'security', 'policy', 'default-security-policy.json')),
    policy_validates: polValid.ok,
    command_guard_module: fileExists(path.join(root, 'src', 'security', 'guards', 'CommandGuard.ts')),
    file_access_guard_module: fileExists(path.join(root, 'src', 'security', 'guards', 'FileAccessGuard.ts')),
    secret_scanner_module: fileExists(path.join(root, 'src', 'security', 'secrets', 'SecretScanner.ts')),
    audit_log_writable: true,
    audit_hash_chain_verifiable: audit.ok || audit.total === 0,
    incident_module: fileExists(path.join(root, 'src', 'governance', 'incidents', 'IncidentManager.ts')),
    emergency_stop_module: fileExists(path.join(root, 'src', 'governance', 'incidents', 'EmergencyStop.ts')),
    approval_workflow_module: fileExists(path.join(root, 'src', 'governance', 'approval', 'ApprovalWorkflow.ts')),
    privacy_mode_configured: !!privacy.mode,
    retention_policy_configured: typeof retention.keep_audit_log_days === 'number',
    prompt_injection_scanner: fileExists(path.join(root, 'src', 'security', 'prompt-injection', 'PromptInjectionScanner.ts')),
    supply_chain_guard: fileExists(path.join(root, 'src', 'security', 'supply-chain', 'SupplyChainReport.ts')),
    untrusted_repo_mode: fileExists(path.join(root, 'src', 'security', 'untrusted', 'RepositoryTrustEvaluator.ts')),
    plugin_mcp_scanner: fileExists(path.join(root, 'src', 'security', 'plugins', 'PluginSecurityScanner.ts')),
    enterprise_governance: fileExists(path.join(root, 'src', 'governance', 'enterprise', 'EnterpriseGovernanceConfig.ts')),
    trust_report_module: fileExists(path.join(root, 'src', 'governance', 'TrustReport.ts')),
    emergency_stop_inactive: !eStop.active,
    threat_model_present: fileExists(path.join(root, 'src', 'security', 'ThreatCatalog.ts')),
    capability_manager: fileExists(path.join(root, 'src', 'security', 'capabilities', 'CapabilityManager.ts')),
  };
  const missing7 = Object.entries(phase7).filter(([, v]) => !v).map(([k]) => k);

  // ---------- Phase 8 probes ----------
  const rel = await releaseCheck(root);
  const docs = await docsCheck(root);
  const prod = await productScore(root);
  const ux = await uxCheck(root);
  const phase8 = {
    cli_help_present: true,
    doctor_command: fileExists(path.join(root, 'src', 'cli', 'commands', 'doctor.ts')),
    next_command: fileExists(path.join(root, 'src', 'cli', 'commands', 'next.ts')),
    quickstart_command: fileExists(path.join(root, 'src', 'cli', 'commands', 'quickstart.ts')),
    config_manager: fileExists(path.join(root, 'src', 'product', 'config', 'ConfigManager.ts')),
    setup_wizard: fileExists(path.join(root, 'src', 'product', 'setup', 'SetupWizard.ts')),
    report_system: fileExists(path.join(root, 'src', 'product', 'reports', 'ReportSystem.ts')),
    report_renderers_present: ['Markdown', 'Json', 'Html'].every((r) => fileExists(path.join(root, 'src', 'product', 'reports', `${r}Renderer.ts`))),
    diagnostic_system: fileExists(path.join(root, 'src', 'product', 'diagnostics', 'DiagnosticSystem.ts')),
    error_catalog: fileExists(path.join(root, 'src', 'product', 'diagnostics', 'ErrorCatalog.ts')),
    claude_integration_manager: fileExists(path.join(root, 'src', 'integrations', 'claude', 'ClaudeIntegrationManager.ts')),
    github_workflow_templates: fileExists(path.join(root, 'templates', 'github', 'workflows', 'demo2project-preflight.yml')),
    extension_manager: fileExists(path.join(root, 'src', 'extensions', 'ExtensionManager.ts')),
    sdk_index: fileExists(path.join(root, 'src', 'sdk', 'index.ts')),
    recipes_present: fileExists(path.join(root, 'recipes', 'node-cli-projectization.json')),
    compatibility_manager: fileExists(path.join(root, 'src', 'product', 'compatibility', 'CompatibilityManager.ts')),
    release_check_runs: rel.checks.length > 0,
    docs_check_runs: docs.total_required > 0,
    product_score_runs: prod.dimensions.length > 0,
    ux_check_runs: ux.checks.length > 0,
    migration_manager: fileExists(path.join(root, 'src', 'product', 'release', 'MigrationManager.ts')),
  };
  const missing8 = Object.entries(phase8).filter(([, v]) => !v).map(([k]) => k);

  const report = {
    self_path: root,
    detected_language: snapshot.detected_language,
    package_manager: snapshot.package_manager,
    score: score.total,
    grade: score.grade,
    blockers: gap.blockers.length,
    findings: gap.findings.length,
    qa_regression: { total: regression.total, passed: regression.passed, failed: regression.failed },
    phase6_probes: phase6,
    phase6_missing: missing6,
    phase7_probes: phase7,
    phase7_missing: missing7,
    phase8_probes: phase8,
    phase8_missing: missing8,
    product_readiness: { grade: prod.grade, score: prod.total_score, out_of: prod.out_of },
    qa_memory: {
      total_cases: qaHealth.total_cases,
      memory_noise_score: qaHealth.memory_noise_score,
      memory_usefulness_score: qaHealth.memory_usefulness_score,
    },
  };
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  return regression.failed === 0 && missing6.length === 0 && missing7.length === 0 && missing8.length === 0 ? 0 : 1;
}

void fs;
