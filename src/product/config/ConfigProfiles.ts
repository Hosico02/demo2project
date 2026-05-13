import type { UnifiedConfig, Profile } from './ConfigSchema.js';
import { DEFAULT_CONFIG } from './ConfigSchema.js';

export const PROFILE_DESCRIPTIONS: Record<Profile, string> = {
  conservative: 'Read-only first. Untrusted repo mode. No automatic code modifications. Approval for most writes.',
  balanced: 'Safe patches with verification. Worktree required for code changes. Workspace QA memory allowed.',
  autonomous: 'Long-run sessions allowed. Self-iteration sandbox available. Strict policy still enforced; high-risk actions still require approval.',
};

export function applyProfile(base: UnifiedConfig, profile: Profile): UnifiedConfig {
  const c: UnifiedConfig = JSON.parse(JSON.stringify(base));
  c.profile = profile;
  if (profile === 'conservative') {
    c.autonomy.level = 'L0_READ_ONLY';
    c.autonomy.max_iterations = 0;
    c.security.require_approval_for_self_modification = true;
    c.security.network_default = 'deny';
    c.privacy.mode = 'private';
    c.qa.workspace_memory_enabled = false;
    c.qa.global_memory_requires_approval = true;
  } else if (profile === 'balanced') {
    c.autonomy.level = 'L2_SAFE_PATCH_WITH_VERIFICATION';
    c.autonomy.max_iterations = 10;
    c.security.require_approval_for_self_modification = true;
    c.security.network_default = 'deny';
    c.privacy.mode = 'normal';
    c.qa.workspace_memory_enabled = true;
    c.qa.global_memory_requires_approval = true;
  } else if (profile === 'autonomous') {
    c.autonomy.level = 'L5_RESTRICTED_AUTONOMOUS_LOOP';
    c.autonomy.max_iterations = 20;
    c.autonomy.max_cost_usd = 5.0;
    c.security.require_approval_for_self_modification = true;
    c.security.network_default = 'allowlist';
    c.privacy.mode = 'normal';
    c.qa.workspace_memory_enabled = true;
    c.qa.global_memory_requires_approval = true;
  }
  return c;
}

export function profileFor(name: Profile): UnifiedConfig {
  return applyProfile(DEFAULT_CONFIG, name);
}
