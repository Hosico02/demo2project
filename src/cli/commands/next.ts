import { nextSteps, firstRunBanner } from '../../product/onboarding/OnboardingGuide.js';
import { defaultSystemRoot } from './_shared.js';

export async function nextCmd(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = typeof flags.project === 'string' ? flags.project : undefined;
  const banner = await firstRunBanner();
  const steps = await nextSteps(defaultSystemRoot(), projectPath);
  process.stdout.write(JSON.stringify({ banner: banner.split('\n').slice(0, 4).join('\n'), next_steps: steps }, null, 2) + '\n');
  return 0;
}
