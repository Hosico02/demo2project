import path from 'node:path';
import { diagnose, proposeHypotheses, listHypotheses, runExperiment, acceptExperiment, rejectExperiment, rollbackExperiment } from '../../core/selfImprovement.js';
import { flagString } from './_shared.js';

function systemRoot(): string {
  return path.resolve(new URL('../../..', import.meta.url).pathname);
}

export async function selfDiagnose(_flags: Record<string, string | boolean>): Promise<number> {
  const r = await diagnose(systemRoot());
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function selfHypotheses(_flags: Record<string, string | boolean>): Promise<number> {
  // List existing first; if none, propose
  let list = await listHypotheses(systemRoot());
  if (list.length === 0) list = await proposeHypotheses(systemRoot());
  process.stdout.write(JSON.stringify({ total: list.length, hypotheses: list }, null, 2) + '\n');
  return 0;
}

export async function selfExperiment(flags: Record<string, string | boolean>): Promise<number> {
  const id = flagString(flags, 'hypothesis');
  if (!id) { process.stderr.write('error: --hypothesis required\n'); return 2; }
  const exp = await runExperiment(systemRoot(), id);
  process.stdout.write(JSON.stringify(exp, null, 2) + '\n');
  return 0;
}

export async function selfAccept(flags: Record<string, string | boolean>): Promise<number> {
  const id = flagString(flags, 'experiment');
  if (!id) { process.stderr.write('error: --experiment required\n'); return 2; }
  const r = await acceptExperiment(systemRoot(), id);
  if (!r) { process.stderr.write('not found\n'); return 1; }
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function selfReject(flags: Record<string, string | boolean>): Promise<number> {
  const id = flagString(flags, 'experiment');
  if (!id) { process.stderr.write('error: --experiment required\n'); return 2; }
  const r = await rejectExperiment(systemRoot(), id);
  if (!r) { process.stderr.write('not found\n'); return 1; }
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function selfRollback(flags: Record<string, string | boolean>): Promise<number> {
  const id = flagString(flags, 'experiment');
  if (!id) { process.stderr.write('error: --experiment required\n'); return 2; }
  const r = await rollbackExperiment(systemRoot(), id);
  if (!r) { process.stderr.write('not found\n'); return 1; }
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}
