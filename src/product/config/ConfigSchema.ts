/**
 * Unified configuration schema (Phase 8).
 *
 * Demo2Project has historically held config across multiple files:
 *   - config/approval-policy.json (Phase 4)
 *   - config/autonomy-policy.json (Phase 6)
 *   - config/security-policy.json (Phase 7)
 *   - config/privacy.json (Phase 7)
 *   - config/retention.json (Phase 7)
 *   - config/enterprise-governance.json (Phase 7)
 *
 * ConfigManager (this module) presents one effective, validated, versioned
 * shape over all of them, and knows how to migrate older shapes forward.
 */

export const CONFIG_SCHEMA_VERSION = '0.0.8';

export type Profile = 'conservative' | 'balanced' | 'autonomous';

export interface UnifiedConfig {
  schema_version: string;
  profile: Profile;
  project_path?: string;
  autonomy: {
    level: 'L0_READ_ONLY' | 'L1_ANALYZE_AND_REPORT' | 'L2_SAFE_PATCH_WITH_VERIFICATION' | 'L3_CODE_PATCH_WITH_APPROVAL' | 'L4_SELF_ITERATION_SANDBOX' | 'L5_RESTRICTED_AUTONOMOUS_LOOP';
    max_iterations: number;
    max_cost_usd: number;
  };
  security: {
    policy_path: string;
    require_approval_for_self_modification: boolean;
    network_default: 'deny' | 'allowlist';
  };
  privacy: {
    mode: 'normal' | 'private' | 'strict_private' | 'enterprise_restricted';
  };
  retention: {
    keep_audit_log_days: number;
    keep_sessions_days: number;
    keep_replay_bundles_days: number;
  };
  qa: {
    workspace_memory_enabled: boolean;
    global_memory_requires_approval: boolean;
  };
  reports: {
    default_format: 'markdown' | 'json' | 'html';
    redact_by_default: boolean;
  };
  integrations: {
    claude_hooks_installed: boolean;
    claude_security_hooks_installed: boolean;
    github_workflows_installed: boolean;
  };
  extensions: {
    enabled: boolean;
    allowlist: string[];
  };
}

export const DEFAULT_CONFIG: UnifiedConfig = {
  schema_version: CONFIG_SCHEMA_VERSION,
  profile: 'balanced',
  autonomy: {
    level: 'L2_SAFE_PATCH_WITH_VERIFICATION',
    max_iterations: 10,
    max_cost_usd: 1.0,
  },
  security: {
    policy_path: 'config/security-policy.json',
    require_approval_for_self_modification: true,
    network_default: 'deny',
  },
  privacy: { mode: 'normal' },
  retention: {
    keep_audit_log_days: 180,
    keep_sessions_days: 30,
    keep_replay_bundles_days: 14,
  },
  qa: {
    workspace_memory_enabled: true,
    global_memory_requires_approval: true,
  },
  reports: {
    default_format: 'markdown',
    redact_by_default: true,
  },
  integrations: {
    claude_hooks_installed: false,
    claude_security_hooks_installed: false,
    github_workflows_installed: false,
  },
  extensions: {
    enabled: false,
    allowlist: [],
  },
};

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function validate(c: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!c || typeof c !== 'object') {
    return { ok: false, errors: ['config is not an object'], warnings };
  }
  const cfg = c as Partial<UnifiedConfig>;
  if (!cfg.schema_version) errors.push('schema_version missing');
  if (cfg.profile && !['conservative', 'balanced', 'autonomous'].includes(cfg.profile)) errors.push(`invalid profile: ${cfg.profile}`);
  if (cfg.autonomy) {
    if (!cfg.autonomy.level) errors.push('autonomy.level missing');
    if (cfg.autonomy.max_iterations !== undefined && cfg.autonomy.max_iterations < 0) errors.push('autonomy.max_iterations must be >= 0');
    if (cfg.autonomy.max_cost_usd !== undefined && cfg.autonomy.max_cost_usd < 0) errors.push('autonomy.max_cost_usd must be >= 0');
  }
  if (cfg.privacy && !['normal', 'private', 'strict_private', 'enterprise_restricted'].includes(cfg.privacy.mode)) errors.push(`invalid privacy.mode: ${cfg.privacy.mode}`);
  if (cfg.security?.network_default && !['deny', 'allowlist'].includes(cfg.security.network_default)) errors.push('invalid security.network_default');
  if (cfg.security?.require_approval_for_self_modification === false) warnings.push('require_approval_for_self_modification=false is a downgrade from default');
  return { ok: errors.length === 0, errors, warnings };
}
