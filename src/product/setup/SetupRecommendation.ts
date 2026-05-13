import path from 'node:path';
import { fileExists } from '../../utils/fs.js';
import { detectArchetype } from '../../core/projectArchetypeDetector.js';
import type { Profile } from '../config/ConfigSchema.js';

export interface SetupRecommendation {
  archetype: string;
  recommended_standard: string;
  recommended_profile: Profile;
  recommended_privacy_mode: 'normal' | 'private' | 'strict_private';
  recommend_claude_hooks: boolean;
  recommend_security_hooks: boolean;
  recommend_github_workflows: boolean;
  reasons: string[];
}

export async function recommend(projectPath: string): Promise<SetupRecommendation> {
  const arch = await detectArchetype(projectPath);
  const reasons: string[] = [];
  let profile: Profile = 'balanced';
  if (arch.primary.risk_profile === 'high') {
    profile = 'conservative';
    reasons.push('high risk archetype → conservative profile');
  } else if (arch.primary.id === 'docs-only-project') {
    profile = 'conservative';
    reasons.push('docs-only repo → conservative');
  }
  const isGithub = fileExists(path.join(projectPath, '.git'));
  return {
    archetype: arch.primary.id,
    recommended_standard: arch.primary.recommended_standard,
    recommended_profile: profile,
    recommended_privacy_mode: profile === 'conservative' ? 'private' : 'normal',
    recommend_claude_hooks: true,
    recommend_security_hooks: true,
    recommend_github_workflows: isGithub,
    reasons,
  };
}
