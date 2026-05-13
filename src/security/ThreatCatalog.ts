/**
 * Threat catalog (Phase 7).
 *
 * Hard-coded inventory of threats Demo2Project recognises. Each threat is
 * declarative: id, category, attack surface, mitigations (policies / tests),
 * and a baseline risk score. Treat this file as immutable documentation —
 * runtime risk scoring lives in RiskScorer.ts; report generation lives in
 * ThreatModelReporter.ts.
 */

export type ThreatCategory =
  | 'malicious_repository'
  | 'prompt_injection'
  | 'secret_exfiltration'
  | 'unsafe_command_execution'
  | 'path_traversal'
  | 'unauthorized_file_access'
  | 'dependency_supply_chain'
  | 'install_script_risk'
  | 'malicious_test_or_build_script'
  | 'qa_memory_poisoning'
  | 'evidence_log_tampering'
  | 'self_modification_abuse'
  | 'approval_bypass'
  | 'plugin_or_mcp_risk'
  | 'network_exfiltration'
  | 'data_retention_risk'
  | 'executor_misreporting'
  | 'score_gaming'
  | 'rollback_failure'
  | 'policy_downgrade_attack';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type ThreatStatus = 'mitigated' | 'partially_mitigated' | 'unmitigated' | 'accepted';

export interface Threat {
  id: string;
  title: string;
  category: ThreatCategory;
  description: string;
  attack_surface: string[];
  affected_components: string[];
  likelihood: RiskLevel;
  impact: RiskLevel;
  risk_level: RiskLevel;
  detection_methods: string[];
  mitigations: string[];
  related_policies: string[];
  related_tests: string[];
  status: ThreatStatus;
}

export const THREAT_CATALOG: Threat[] = [
  {
    id: 'T001',
    title: 'Untrusted repository runs arbitrary install scripts',
    category: 'malicious_repository',
    description: 'A cloned repo contains a postinstall script that exfiltrates secrets or installs persistence.',
    attack_surface: ['package.json scripts', 'pyproject postinstall', 'Makefile install'],
    affected_components: ['ExecutorAgent', 'commandRunner', 'SupplyChainGuard'],
    likelihood: 'medium',
    impact: 'critical',
    risk_level: 'high',
    detection_methods: ['UntrustedRepositoryScanner', 'PackageScriptAnalyzer'],
    mitigations: ['untrusted repo mode blocks install scripts', 'SecurityPolicyEngine.dependency_install requires approval'],
    related_policies: ['dependency_install', 'package_script_execution'],
    related_tests: ['tests/security/untrustedRepositoryMode.test.ts', 'tests/security/supplyChainGuard.test.ts'],
    status: 'mitigated',
  },
  {
    id: 'T002',
    title: 'Prompt injection in README/comments alters executor behavior',
    category: 'prompt_injection',
    description: 'A repo embeds instructions telling the AI to skip verification, leak secrets, or disable hooks.',
    attack_surface: ['README.md', 'code comments', 'test fixtures', 'issue templates', 'docs/'],
    affected_components: ['ClaudeCliProvider', 'PromptContextSanitizer'],
    likelihood: 'medium',
    impact: 'high',
    risk_level: 'high',
    detection_methods: ['PromptInjectionScanner'],
    mitigations: ['repo content is sanitized into a separate context block', 'instruction boundary forbids privilege escalation from repo content'],
    related_policies: ['file_read'],
    related_tests: ['tests/security/promptInjectionScanner.test.ts', 'tests/security/promptContextSanitizer.test.ts'],
    status: 'mitigated',
  },
  {
    id: 'T003',
    title: 'Secrets exfiltrated via logs / QA memory / replay bundle',
    category: 'secret_exfiltration',
    description: 'A captured API key or .env value ends up in a persisted artifact and is shared downstream.',
    attack_surface: ['event JSONL', 'evidence graph', 'replay bundle', 'reports/', 'audit log'],
    affected_components: ['eventStore', 'evidenceGraph', 'replaySystem', 'AuditLog'],
    likelihood: 'high',
    impact: 'high',
    risk_level: 'high',
    detection_methods: ['SecretScanner', 'SecretExposureDetector'],
    mitigations: ['redaction.ts applied on every persisted write', 'replay bundle drops raw source', 'audit log strips secrets'],
    related_policies: ['report_export', 'replay_bundle_export'],
    related_tests: ['tests/security/secretScanner.test.ts', 'tests/security/secretRedactor.test.ts', 'tests/security/secretExposureDetector.test.ts'],
    status: 'mitigated',
  },
  {
    id: 'T004',
    title: 'Executor runs rm -rf / sudo / fork bomb / dd-to-disk',
    category: 'unsafe_command_execution',
    description: 'An attacker-supplied task description tricks the executor into running a system-destructive command.',
    attack_surface: ['ExecutorAgent commands_run', 'rule-based handlers', 'verification commands'],
    affected_components: ['commandRunner', 'safety.ts', 'CommandGuard'],
    likelihood: 'low',
    impact: 'critical',
    risk_level: 'high',
    detection_methods: ['CommandGuard pre-execution check'],
    mitigations: ['safety.ts FORBIDDEN_PATTERNS', 'CommandGuard with extended pattern list', 'Claude CLI pre-tool-use hook'],
    related_policies: ['command_execution'],
    related_tests: ['tests/security/commandGuard.test.ts'],
    status: 'mitigated',
  },
  {
    id: 'T005',
    title: 'Path traversal reads files outside the project',
    category: 'path_traversal',
    description: 'A handler resolves a ../../etc/passwd-style path and reads sensitive host files.',
    attack_surface: ['file read operations', 'config paths', 'archive extraction'],
    affected_components: ['FileAccessGuard', 'iterationWorkspace'],
    likelihood: 'low',
    impact: 'high',
    risk_level: 'medium',
    detection_methods: ['FileAccessGuard.checkPath with isInsideDir'],
    mitigations: ['FileAccessGuard rejects reads outside project boundaries'],
    related_policies: ['file_read', 'file_write'],
    related_tests: ['tests/security/fileAccessGuard.test.ts'],
    status: 'mitigated',
  },
  {
    id: 'T006',
    title: 'Reading .env, private key, or credential files',
    category: 'unauthorized_file_access',
    description: 'An iteration reads secrets that should never leave the developer machine.',
    attack_surface: ['file read', 'snapshot', 'docs truth check'],
    affected_components: ['FileAccessGuard', 'SecurityPolicyEngine'],
    likelihood: 'medium',
    impact: 'high',
    risk_level: 'high',
    detection_methods: ['FileAccessGuard.isSecretPath'],
    mitigations: ['file_read policy denies .env / id_rsa / credentials by default'],
    related_policies: ['file_read'],
    related_tests: ['tests/security/fileAccessGuard.test.ts'],
    status: 'mitigated',
  },
  {
    id: 'T007',
    title: 'Typo-squat or malicious transitive dependency added',
    category: 'dependency_supply_chain',
    description: 'A new dependency is added that resembles a popular package but is actually attacker-controlled.',
    attack_surface: ['package.json dependencies', 'lockfile additions'],
    affected_components: ['DependencyRiskAnalyzer'],
    likelihood: 'medium',
    impact: 'high',
    risk_level: 'high',
    detection_methods: ['DependencyRiskAnalyzer typo-squat heuristic', 'LockfileChangeAnalyzer'],
    mitigations: ['dependency_install requires approval for new packages', 'lockfile diff size cap'],
    related_policies: ['dependency_install'],
    related_tests: ['tests/security/supplyChainGuard.test.ts', 'tests/security/lockfileChangeAnalyzer.test.ts'],
    status: 'partially_mitigated',
  },
  {
    id: 'T008',
    title: 'postinstall / preinstall / prepare script abuse',
    category: 'install_script_risk',
    description: 'A package declares a lifecycle script that runs arbitrary code at install time.',
    attack_surface: ['package.json scripts', 'lifecycle hooks'],
    affected_components: ['PackageScriptAnalyzer', 'InstallScriptPolicy'],
    likelihood: 'medium',
    impact: 'critical',
    risk_level: 'high',
    detection_methods: ['PackageScriptAnalyzer.findLifecycleScripts'],
    mitigations: ['untrusted repo: no install scripts allowed; require approval otherwise'],
    related_policies: ['dependency_install', 'package_script_execution'],
    related_tests: ['tests/security/packageScriptAnalyzer.test.ts'],
    status: 'mitigated',
  },
  {
    id: 'T009',
    title: 'Malicious test or build script exfiltrates secrets',
    category: 'malicious_test_or_build_script',
    description: 'A test or build script calls curl / nc / scp to send data offsite during verification.',
    attack_surface: ['vitest/pytest config', 'webpack/vite plugins', 'Makefile'],
    affected_components: ['PackageScriptAnalyzer', 'NetworkGuard'],
    likelihood: 'low',
    impact: 'high',
    risk_level: 'medium',
    detection_methods: ['NetworkGuard logs all network access intent'],
    mitigations: ['untrusted repo: network access denied'],
    related_policies: ['network_access', 'package_script_execution'],
    related_tests: ['tests/security/packageScriptAnalyzer.test.ts', 'tests/security/networkGuard.test.ts'],
    status: 'partially_mitigated',
  },
  {
    id: 'T010',
    title: 'QA memory poisoning with fake high-frequency case',
    category: 'qa_memory_poisoning',
    description: 'A repo seeds the QA store with synthetic high-confidence cases that bias future learning.',
    attack_surface: ['qa-cases.json import', 'cross-project learning promotions'],
    affected_components: ['QACaseStore', 'CrossProjectLearningEngine'],
    likelihood: 'low',
    impact: 'medium',
    risk_level: 'medium',
    detection_methods: ['QAMemoryHealthManager noise score', 'transferability gate on promotions'],
    mitigations: ['workspace and global promotions require approval'],
    related_policies: ['qa_memory_update', 'global_memory_update'],
    related_tests: ['tests/security/securityPolicyEngine.test.ts'],
    status: 'partially_mitigated',
  },
  {
    id: 'T011',
    title: 'Silent tampering of evidence / audit log',
    category: 'evidence_log_tampering',
    description: 'An attacker edits past audit records to hide an incident.',
    attack_surface: ['audit log JSONL on disk', 'evidence graph JSON'],
    affected_components: ['AuditLog', 'AuditHashChain', 'AuditVerifier'],
    likelihood: 'medium',
    impact: 'high',
    risk_level: 'high',
    detection_methods: ['AuditHashChain.verify'],
    mitigations: ['each event includes hash of previous event; verifier detects breaks'],
    related_policies: ['evidence_graph_update'],
    related_tests: ['tests/governance/auditHashChain.test.ts', 'tests/governance/auditVerifier.test.ts'],
    status: 'mitigated',
  },
  {
    id: 'T012',
    title: 'Self-iteration modifies safety core',
    category: 'self_modification_abuse',
    description: 'Self-improvement loop proposes changes to safety.ts / redaction.ts / approvalGate.ts.',
    attack_surface: ['SelfImprovementEngine hypotheses'],
    affected_components: ['SelfImprovementEngine', 'AutonomyPolicy.forbidden_self_modifications'],
    likelihood: 'low',
    impact: 'critical',
    risk_level: 'high',
    detection_methods: ['hypothesis affected_modules vs forbidden list'],
    mitigations: ['forbidden_self_modifications check at proposal time'],
    related_policies: ['self_iteration', 'modify_security_policy'],
    related_tests: ['tests/security/leastPrivilege.test.ts'],
    status: 'mitigated',
  },
  {
    id: 'T013',
    title: 'Approval workflow bypass via direct file write',
    category: 'approval_bypass',
    description: 'A handler bypasses approvals by writing directly to high-risk paths.',
    attack_surface: ['file_write code paths', 'rule-based handlers'],
    affected_components: ['ApprovalWorkflow', 'FileAccessGuard'],
    likelihood: 'low',
    impact: 'high',
    risk_level: 'medium',
    detection_methods: ['FileAccessGuard routes high-risk writes through SecurityPolicyEngine'],
    mitigations: ['high-risk paths require require_approval policy decision'],
    related_policies: ['file_write', 'modify_security_policy'],
    related_tests: ['tests/governance/approvalWorkflow.test.ts'],
    status: 'mitigated',
  },
  {
    id: 'T014',
    title: 'Plugin or MCP server expands executor capabilities',
    category: 'plugin_or_mcp_risk',
    description: 'A Claude CLI plugin installs MCP servers that read fs or call network without approval.',
    attack_surface: ['~/.claude/plugins', 'mcp.json', 'project .claude/'],
    affected_components: ['PluginSecurityScanner', 'McpSecurityScanner', 'HookSecurityScanner'],
    likelihood: 'medium',
    impact: 'high',
    risk_level: 'high',
    detection_methods: ['plugin/mcp scanners report capabilities at install time'],
    mitigations: ['plugins and MCP not auto-installed; require approval'],
    related_policies: ['plugin_installation', 'mcp_server_usage'],
    related_tests: ['tests/security/pluginSecurityScanner.test.ts', 'tests/security/mcpSecurityScanner.test.ts', 'tests/security/hookSecurityScanner.test.ts'],
    status: 'mitigated',
  },
  {
    id: 'T015',
    title: 'Network exfiltration of artifacts',
    category: 'network_exfiltration',
    description: 'A handler uploads logs, evidence, or replay bundles to an external URL.',
    attack_surface: ['curl / wget / fetch calls inside commands'],
    affected_components: ['NetworkGuard', 'CommandGuard'],
    likelihood: 'low',
    impact: 'high',
    risk_level: 'medium',
    detection_methods: ['NetworkGuard intent logging', 'CommandGuard pipe-to-shell ban'],
    mitigations: ['network_access requires policy allow; untrusted repo denies all'],
    related_policies: ['network_access'],
    related_tests: ['tests/security/networkGuard.test.ts'],
    status: 'partially_mitigated',
  },
  {
    id: 'T016',
    title: 'Indefinite retention of sensitive data',
    category: 'data_retention_risk',
    description: 'Logs, evidence, and QA cases accumulate forever and leak across teams.',
    attack_surface: ['.demo2project/ state on disk', 'reports/'],
    affected_components: ['DataRetentionPolicy', 'PrivacyMode'],
    likelihood: 'high',
    impact: 'medium',
    risk_level: 'medium',
    detection_methods: ['DataInventory'],
    mitigations: ['retention cleanup CLI', 'privacy modes redact more aggressively'],
    related_policies: ['report_export', 'replay_bundle_export'],
    related_tests: ['tests/privacy/dataRetentionPolicy.test.ts', 'tests/privacy/dataDeletion.test.ts'],
    status: 'mitigated',
  },
  {
    id: 'T017',
    title: 'Executor lies about completion (misreporting)',
    category: 'executor_misreporting',
    description: 'The model claims a task is done without running verification.',
    attack_surface: ['executor task_status'],
    affected_components: ['ExecutorAgent verification gate', 'antiGamingScorer'],
    likelihood: 'high',
    impact: 'medium',
    risk_level: 'high',
    detection_methods: ['verification gate downgrades completed→failed when commands_run empty', 'anti-gaming detectors'],
    mitigations: ['verification gate is mandatory and on forbidden list'],
    related_policies: ['verification_gate_update'],
    related_tests: ['tests/security/leastPrivilege.test.ts'],
    status: 'mitigated',
  },
  {
    id: 'T018',
    title: 'Score gaming via empty tests / echo build / sham CI',
    category: 'score_gaming',
    description: 'Handler creates an empty test file or a CI yaml with no real assertions to inflate score.',
    attack_surface: ['rule-based handlers', 'AI-generated code'],
    affected_components: ['antiGamingScorer'],
    likelihood: 'medium',
    impact: 'medium',
    risk_level: 'medium',
    detection_methods: ['8 anti-gaming detectors'],
    mitigations: ['evidence-weighted score penalises empty/echo/fake artifacts'],
    related_policies: [],
    related_tests: ['tests/security/securityPolicyEngine.test.ts'],
    status: 'mitigated',
  },
  {
    id: 'T019',
    title: 'Rollback fails to restore state after regression',
    category: 'rollback_failure',
    description: 'Branch-based rollback cannot recover because git ref was lost or new state was committed first.',
    attack_surface: ['IterationWorkspace', 'autonomy:run rollback path'],
    affected_components: ['IterationWorkspace', 'LongHorizonAutonomyController'],
    likelihood: 'low',
    impact: 'high',
    risk_level: 'medium',
    detection_methods: ['session manifest base_commit assertion', 'GovernanceDecisionLog'],
    mitigations: ['workspace manifest captures base_commit before any write'],
    related_policies: [],
    related_tests: ['tests/security/securityPolicyEngine.test.ts'],
    status: 'partially_mitigated',
  },
  {
    id: 'T020',
    title: 'Policy downgrade attack via config edit',
    category: 'policy_downgrade_attack',
    description: 'An attacker (or buggy self-iteration) reduces autonomy/security policy strictness.',
    attack_surface: ['config/security-policy.json', 'config/autonomy-policy.json'],
    affected_components: ['SecurityPolicyEngine', 'AutonomyPolicy'],
    likelihood: 'low',
    impact: 'critical',
    risk_level: 'high',
    detection_methods: ['policy diff vs baseline at every load', 'audit log of edits'],
    mitigations: ['policy paths in forbidden_self_modifications; edits require approval'],
    related_policies: ['modify_security_policy', 'approval_policy_update'],
    related_tests: ['tests/security/policyViolation.test.ts'],
    status: 'mitigated',
  },
];

export function findThreat(id: string): Threat | undefined {
  return THREAT_CATALOG.find((t) => t.id === id);
}

export function threatsByCategory(cat: ThreatCategory): Threat[] {
  return THREAT_CATALOG.filter((t) => t.category === cat);
}
