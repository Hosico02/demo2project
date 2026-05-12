import path from 'node:path';
import { suggestStandardUpdates, listSuggestions, decideSuggestion } from '../../eval/standardFeedback.js';
import { flagString } from './_shared.js';

function systemRoot(): string { return path.resolve(new URL('../../..', import.meta.url).pathname); }

export async function standardsSuggestCmd(_flags: Record<string, string | boolean>): Promise<number> {
  const r = await suggestStandardUpdates(systemRoot());
  process.stdout.write(JSON.stringify({ total: r.length, suggestions: r }, null, 2) + '\n');
  return 0;
}

export async function standardsApproveCmd(flags: Record<string, string | boolean>): Promise<number> {
  const id = flagString(flags, 'id');
  if (!id) { process.stderr.write('error: --id required\n'); return 2; }
  const r = await decideSuggestion({ systemRoot: systemRoot(), id, decision: 'approved' });
  if (!r) { process.stderr.write('not found\n'); return 1; }
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function standardsRejectCmd(flags: Record<string, string | boolean>): Promise<number> {
  const id = flagString(flags, 'id');
  if (!id) { process.stderr.write('error: --id required\n'); return 2; }
  const r = await decideSuggestion({ systemRoot: systemRoot(), id, decision: 'rejected' });
  if (!r) { process.stderr.write('not found\n'); return 1; }
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function standardsSuggestionsListCmd(_flags: Record<string, string | boolean>): Promise<number> {
  const r = await listSuggestions(systemRoot());
  process.stdout.write(JSON.stringify({ total: r.length, suggestions: r }, null, 2) + '\n');
  return 0;
}
