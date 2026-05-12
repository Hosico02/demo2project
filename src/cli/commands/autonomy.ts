import path from 'node:path';
import { loadPolicy, setAutonomyLevel, explain, AUTONOMY_LEVELS, type AutonomyLevel, ensurePolicyFile } from '../../core/autonomyPolicy.js';
import { flagString } from './_shared.js';

function systemRoot(): string {
  return path.resolve(new URL('../../..', import.meta.url).pathname);
}

export async function autonomyPolicyCmd(_flags: Record<string, string | boolean>): Promise<number> {
  await ensurePolicyFile(systemRoot());
  const p = await loadPolicy(systemRoot());
  process.stdout.write(JSON.stringify(p, null, 2) + '\n');
  return 0;
}

export async function autonomySetLevelCmd(flags: Record<string, string | boolean>): Promise<number> {
  const level = flagString(flags, 'level');
  if (!level) { process.stderr.write('error: --level required\n'); return 2; }
  if (!AUTONOMY_LEVELS.includes(level as AutonomyLevel)) {
    process.stderr.write(`error: invalid level. choices: ${AUTONOMY_LEVELS.join(', ')}\n`);
    return 2;
  }
  const next = await setAutonomyLevel(systemRoot(), level as AutonomyLevel);
  process.stdout.write(JSON.stringify({ updated_level: next.default_autonomy_level }, null, 2) + '\n');
  return 0;
}

export async function autonomyExplainCmd(flags: Record<string, string | boolean>): Promise<number> {
  const level = flagString(flags, 'level');
  const e = await explain(systemRoot(), level as AutonomyLevel | undefined);
  process.stdout.write(JSON.stringify(e, null, 2) + '\n');
  return 0;
}
