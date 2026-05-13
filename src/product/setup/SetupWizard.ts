import path from 'node:path';
import { ConfigManager } from '../config/ConfigManager.js';
import { applyProfile } from '../config/ConfigProfiles.js';
import type { Profile, UnifiedConfig } from '../config/ConfigSchema.js';
import { recommend } from './SetupRecommendation.js';
import type { SetupRecommendation } from './SetupRecommendation.js';
import { renderPlan } from './SetupRenderer.js';
import type { SetupPlan } from './SetupRenderer.js';

export interface SetupOptions {
  systemRoot: string;
  projectPath?: string;
  profile?: Profile;
  dryRun?: boolean;
  interactive?: boolean;
}

export interface SetupResult {
  plan: SetupPlan;
  written_files: string[];
  next_steps: string[];
}

export async function runSetup(opts: SetupOptions): Promise<SetupResult> {
  const cm = new ConfigManager(opts.systemRoot);
  let rec: SetupRecommendation;
  if (opts.projectPath) {
    rec = await recommend(opts.projectPath);
  } else {
    rec = {
      archetype: 'unknown',
      recommended_standard: 'generic',
      recommended_profile: opts.profile ?? 'balanced',
      recommended_privacy_mode: 'normal',
      recommend_claude_hooks: true,
      recommend_security_hooks: true,
      recommend_github_workflows: false,
      reasons: ['no project path supplied; using defaults'],
    };
  }
  const profile = opts.profile ?? rec.recommended_profile;
  const cur = await cm.loadEffective(opts.projectPath);
  const next: UnifiedConfig = applyProfile(cur.config, profile);
  next.privacy.mode = rec.recommended_privacy_mode;
  const filesToWrite: string[] = [
    opts.projectPath ? cm.projectConfigPath(opts.projectPath) : cm.systemConfigPath(),
  ];
  const nextSteps: string[] = [
    'pnpm demo2project doctor',
    'pnpm demo2project analyze --project <path>',
    'pnpm demo2project gap --project <path>',
    'pnpm demo2project qa:preflight --project <path>',
    'pnpm demo2project trust:check --project <path>',
  ];
  if (rec.recommend_claude_hooks || rec.recommend_security_hooks) {
    nextSteps.push('pnpm demo2project claude:install-security-hooks --project <path>');
  }
  if (rec.recommend_github_workflows) {
    nextSteps.push('pnpm demo2project github:install-workflows --dry-run');
  }
  const plan: SetupPlan = { recommendation: rec, config: next, files_to_write: filesToWrite, next_steps: nextSteps };
  if (opts.dryRun) {
    return { plan, written_files: [], next_steps: nextSteps };
  }
  const written: string[] = [];
  if (opts.projectPath) {
    await cm.saveProject(opts.projectPath, next);
    written.push(cm.projectConfigPath(opts.projectPath));
  } else {
    await cm.saveSystem(next);
    written.push(cm.systemConfigPath());
  }
  return { plan, written_files: written, next_steps: nextSteps };
}

export { renderPlan };
void path;
