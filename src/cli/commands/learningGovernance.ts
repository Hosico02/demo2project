import path from 'node:path';
import { buildCandidates, listCandidates, decideCandidate, explainCandidate } from '../../eval/learningGovernance.js';
import { flagString } from './_shared.js';

function systemRoot(): string { return path.resolve(new URL('../../..', import.meta.url).pathname); }

export async function learningCandidatesCmd(_flags: Record<string, string | boolean>): Promise<number> {
  const fresh = await buildCandidates(systemRoot());
  process.stdout.write(JSON.stringify({ total: fresh.length, candidates: fresh }, null, 2) + '\n');
  return 0;
}

export async function learningApproveCmd(flags: Record<string, string | boolean>): Promise<number> {
  const id = flagString(flags, 'candidate');
  if (!id) { process.stderr.write('error: --candidate <id>\n'); return 2; }
  const r = await decideCandidate({ systemRoot: systemRoot(), id, decision: 'approved', note: flagString(flags, 'note') });
  if (!r) { process.stderr.write('not found\n'); return 1; }
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function learningRejectCmd(flags: Record<string, string | boolean>): Promise<number> {
  const id = flagString(flags, 'candidate');
  if (!id) { process.stderr.write('error: --candidate <id>\n'); return 2; }
  const r = await decideCandidate({ systemRoot: systemRoot(), id, decision: 'rejected', note: flagString(flags, 'note') });
  if (!r) { process.stderr.write('not found\n'); return 1; }
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function learningExplainCmd(flags: Record<string, string | boolean>): Promise<number> {
  const id = flagString(flags, 'candidate');
  if (!id) { process.stderr.write('error: --candidate <id>\n'); return 2; }
  const r = await explainCandidate(systemRoot(), id);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function alsoCandidatesList(_flags: Record<string, string | boolean>): Promise<number> {
  const r = await listCandidates(systemRoot());
  process.stdout.write(JSON.stringify({ total: r.length, candidates: r }, null, 2) + '\n');
  return 0;
}
