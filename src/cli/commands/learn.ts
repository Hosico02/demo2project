import path from 'node:path';
import { learnWorkspace, learnProject, loadPatterns } from '../../eval/crossProjectLearning.js';
import { flagString } from './_shared.js';

function systemRoot(): string {
  return path.resolve(new URL('../../..', import.meta.url).pathname);
}

export async function learnWorkspaceCmd(_flags: Record<string, string | boolean>): Promise<number> {
  const patterns = await learnWorkspace({ systemRoot: systemRoot() });
  process.stdout.write(JSON.stringify({ patterns: patterns.length, list: patterns.map((p) => ({ id: p.id, type: p.pattern_type, title: p.title })) }, null, 2) + '\n');
  return 0;
}

export async function learnProjectCmd(flags: Record<string, string | boolean>): Promise<number> {
  const id = flagString(flags, 'id');
  if (!id) { process.stderr.write('error: --id <report_id> required\n'); return 2; }
  const patterns = await learnProject({ systemRoot: systemRoot(), reportId: id });
  process.stdout.write(JSON.stringify(patterns, null, 2) + '\n');
  return 0;
}

export async function learnPatternsCmd(_flags: Record<string, string | boolean>): Promise<number> {
  const p = await loadPatterns(systemRoot());
  process.stdout.write(JSON.stringify({ total: p.length, patterns: p }, null, 2) + '\n');
  return 0;
}

export async function learnExplainCmd(flags: Record<string, string | boolean>): Promise<number> {
  const id = flagString(flags, 'pattern');
  if (!id) { process.stderr.write('error: --pattern <id> required\n'); return 2; }
  const all = await loadPatterns(systemRoot());
  const hit = all.find((p) => p.id === id);
  if (!hit) { process.stderr.write('not found\n'); return 1; }
  process.stdout.write(JSON.stringify(hit, null, 2) + '\n');
  return 0;
}
