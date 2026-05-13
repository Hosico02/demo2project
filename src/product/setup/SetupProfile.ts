import type { Profile } from '../config/ConfigSchema.js';
import { PROFILE_DESCRIPTIONS } from '../config/ConfigProfiles.js';

export function describeProfile(p: Profile): { profile: Profile; description: string } {
  return { profile: p, description: PROFILE_DESCRIPTIONS[p] };
}

export function profileFromAnswer(answer: string | undefined): Profile {
  if (answer === 'conservative' || answer === 'balanced' || answer === 'autonomous') return answer;
  return 'balanced';
}
