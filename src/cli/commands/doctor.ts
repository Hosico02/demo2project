import { diagnose } from '../../product/diagnostics/DiagnosticSystem.js';
import { defaultSystemRoot } from './_shared.js';

export async function doctor(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = typeof flags.project === 'string' ? flags.project : undefined;
  const r = await diagnose(defaultSystemRoot(), projectPath);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return r.ok ? 0 : 1;
}
