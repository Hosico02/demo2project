import type { SetupRecommendation } from './SetupRecommendation.js';
import type { UnifiedConfig } from '../config/ConfigSchema.js';

export interface SetupPlan {
  recommendation: SetupRecommendation;
  config: UnifiedConfig;
  files_to_write: string[];
  next_steps: string[];
}

export function renderPlan(plan: SetupPlan): string {
  const lines: string[] = [];
  lines.push('## Demo2Project setup plan');
  lines.push('');
  lines.push(`- Archetype: ${plan.recommendation.archetype}`);
  lines.push(`- Standard: ${plan.recommendation.recommended_standard}`);
  lines.push(`- Profile: ${plan.recommendation.recommended_profile}`);
  lines.push(`- Privacy mode: ${plan.recommendation.recommended_privacy_mode}`);
  lines.push('');
  lines.push('### Will write');
  for (const f of plan.files_to_write) lines.push(`- ${f}`);
  lines.push('');
  lines.push('### Next steps');
  for (const s of plan.next_steps) lines.push(`- ${s}`);
  return lines.join('\n') + '\n';
}
