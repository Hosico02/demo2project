import path from 'node:path';
import {
  corpusAdd, corpusRemove, corpusList, corpusEvaluate, corpusReport,
} from '../../eval/projectCorpus.js';
import { flagString } from './_shared.js';

function systemRoot(): string {
  return path.resolve(new URL('../../..', import.meta.url).pathname);
}

export async function corpusAddCmd(flags: Record<string, string | boolean>): Promise<number> {
  const proj = flagString(flags, 'project');
  if (!proj) { process.stderr.write('error: --project required\n'); return 2; }
  const entry = await corpusAdd({
    systemRoot: systemRoot(),
    projectPath: path.resolve(proj),
    name: flagString(flags, 'name'),
    notes: flagString(flags, 'notes'),
    tags: (flagString(flags, 'tags') ?? '').split(',').filter(Boolean),
  });
  process.stdout.write(JSON.stringify(entry, null, 2) + '\n');
  return 0;
}

export async function corpusListCmd(_flags: Record<string, string | boolean>): Promise<number> {
  const entries = await corpusList({ systemRoot: systemRoot() });
  process.stdout.write(JSON.stringify({ total: entries.length, entries }, null, 2) + '\n');
  return 0;
}

export async function corpusEvaluateCmd(flags: Record<string, string | boolean>): Promise<number> {
  const id = flagString(flags, 'id');
  const all = flags.all === true || flags.all === 'true';
  if (!all && !id) { process.stderr.write('error: --id or --all required\n'); return 2; }
  const reports = await corpusEvaluate({ systemRoot: systemRoot(), id, all });
  process.stdout.write(JSON.stringify({ reports }, null, 2) + '\n');
  return 0;
}

export async function corpusRemoveCmd(flags: Record<string, string | boolean>): Promise<number> {
  const id = flagString(flags, 'id');
  if (!id) { process.stderr.write('error: --id required\n'); return 2; }
  const ok = await corpusRemove({ systemRoot: systemRoot(), id });
  process.stdout.write(JSON.stringify({ removed: ok, id }, null, 2) + '\n');
  return ok ? 0 : 1;
}

export async function corpusReportCmd(_flags: Record<string, string | boolean>): Promise<number> {
  const r = await corpusReport({ systemRoot: systemRoot() });
  process.stdout.write(JSON.stringify({ wrote: r.reportPath, total: r.total, archetypes: r.archetypes }, null, 2) + '\n');
  return 0;
}
