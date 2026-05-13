import { runSetup, renderPlan } from '../../product/setup/SetupWizard.js';
import { defaultSystemRoot, flagString } from './_shared.js';
import type { Profile } from '../../product/config/ConfigSchema.js';

export async function initWizard(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = flagString(flags, 'project');
  const profile = flagString(flags, 'profile') as Profile | undefined;
  const dryRun = flags['dry-run'] === true || flags['dry-run'] === 'true';
  const r = await runSetup({ systemRoot: defaultSystemRoot(), projectPath, profile, dryRun });
  process.stdout.write(JSON.stringify({ plan_summary: { archetype: r.plan.recommendation.archetype, profile: r.plan.config.profile }, written_files: r.written_files, next_steps: r.next_steps, plan_md: renderPlan(r.plan) }, null, 2) + '\n');
  return 0;
}
