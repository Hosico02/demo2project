import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fileExists } from '../src/utils/fs.js';
import { loadSecurityPolicy, validate } from '../src/security/policy/SecurityPolicyEngine.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('Phase 7 self-check probes', () => {
  it('security policy file or default is loadable and valid', async () => {
    const p = await loadSecurityPolicy(root);
    const v = validate(p);
    expect(v.ok).toBe(true);
    expect(p.rules.length).toBeGreaterThan(20);
  });
  it('all Phase 7 module files exist', () => {
    const required = [
      'src/security/ThreatCatalog.ts',
      'src/security/ThreatModel.ts',
      'src/security/policy/SecurityPolicyEngine.ts',
      'src/security/policy/PolicyEvaluator.ts',
      'src/security/policy/PolicyViolation.ts',
      'src/security/capabilities/CapabilityManager.ts',
      'src/security/untrusted/RepositoryTrustEvaluator.ts',
      'src/security/untrusted/UntrustedRepositoryScanner.ts',
      'src/security/untrusted/QuarantineMode.ts',
      'src/security/prompt-injection/PromptInjectionScanner.ts',
      'src/security/prompt-injection/PromptContextSanitizer.ts',
      'src/security/secrets/SecretScanner.ts',
      'src/security/secrets/SecretExposureDetector.ts',
      'src/security/supply-chain/DependencyRiskAnalyzer.ts',
      'src/security/supply-chain/PackageScriptAnalyzer.ts',
      'src/security/supply-chain/LockfileChangeAnalyzer.ts',
      'src/security/supply-chain/SupplyChainReport.ts',
      'src/security/guards/CommandGuard.ts',
      'src/security/guards/FileAccessGuard.ts',
      'src/security/guards/NetworkGuard.ts',
      'src/security/guards/GuardedCommandRunner.ts',
      'src/security/guards/GuardedFileSystem.ts',
      'src/security/plugins/PluginSecurityScanner.ts',
      'src/security/plugins/McpSecurityScanner.ts',
      'src/security/plugins/HookSecurityScanner.ts',
      'src/governance/audit/AuditLog.ts',
      'src/governance/audit/AuditHashChain.ts',
      'src/governance/audit/AuditVerifier.ts',
      'src/governance/approval/ApprovalWorkflow.ts',
      'src/governance/incidents/IncidentManager.ts',
      'src/governance/incidents/EmergencyStop.ts',
      'src/governance/enterprise/RoleBasedAccess.ts',
      'src/governance/enterprise/EnterpriseGovernanceConfig.ts',
      'src/governance/TrustReport.ts',
      'src/privacy/PrivacyMode.ts',
      'src/privacy/DataRetentionPolicy.ts',
      'src/privacy/DataInventory.ts',
      'src/privacy/DataDeletion.ts',
    ];
    for (const r of required) expect(fileExists(path.join(root, r))).toBe(true);
  });
  it('8 security hook templates present', () => {
    const hooks = ['pre-tool-use-security-policy.mjs', 'pre-tool-use-command-guard.mjs', 'pre-tool-use-file-access-guard.mjs', 'pre-tool-use-secret-protection.mjs', 'post-tool-use-audit-recorder.mjs', 'post-tool-use-evidence-recorder.mjs', 'stop-verification-and-policy-gate.mjs', 'stop-incident-check.mjs'];
    for (const h of hooks) expect(fileExists(path.join(root, 'templates', 'claude', 'hooks', h))).toBe(true);
  });
});
