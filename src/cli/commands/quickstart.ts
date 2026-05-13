import { runQuickstart } from '../../product/onboarding/Quickstart.js';
import { defaultSystemRoot } from './_shared.js';

export async function quickstart(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = typeof flags.project === 'string' ? flags.project : undefined;
  const useExample = flags['use-example'] === true || flags['use-example'] === 'true';
  const r = await runQuickstart({ systemRoot: defaultSystemRoot(), projectPath, useExample });
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}
