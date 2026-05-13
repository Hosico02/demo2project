import { check, notes } from '../../product/release/ReleaseCheck.js';
import { status as migStatus, run as migRun } from '../../product/release/MigrationManager.js';
import { score as productScore } from '../../product/release/ProductReadinessScorer.js';
import { check as uxCheck } from '../../product/ux/UXQualityChecker.js';
import { check as docsCheck } from '../../product/docs/DocsChecker.js';
import { defaultSystemRoot, flagString } from './_shared.js';

export async function releaseCheck(_flags: Record<string, string | boolean>): Promise<number> {
  const r = await check(defaultSystemRoot());
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return r.ok ? 0 : 1;
}

export async function releaseNotes(flags: Record<string, string | boolean>): Promise<number> {
  const version = flagString(flags, 'version') ?? '0.0.8';
  const n = await notes(defaultSystemRoot(), version);
  process.stdout.write(n + '\n');
  return 0;
}

export async function migrationCheck(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = flagString(flags, 'project');
  const r = await migStatus(defaultSystemRoot(), projectPath);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function migrate(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = flagString(flags, 'project');
  const dryRun = flags['dry-run'] === true || flags['dry-run'] === 'true';
  const r = await migRun(defaultSystemRoot(), projectPath, { dryRun });
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function productScoreCmd(_flags: Record<string, string | boolean>): Promise<number> {
  const r = await productScore(defaultSystemRoot());
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function productReport(_flags: Record<string, string | boolean>): Promise<number> {
  const r = await productScore(defaultSystemRoot());
  const lines = [`# Product readiness — ${r.grade}`, '', `Score: ${r.total_score}/${r.out_of}`, '', '## Dimensions', ...r.dimensions.map((d) => `- ${d.name}: ${d.score}/${d.out_of} — ${d.notes.join('; ')}`)];
  process.stdout.write(lines.join('\n') + '\n');
  return 0;
}

export async function uxCheckCmd(_flags: Record<string, string | boolean>): Promise<number> {
  const r = await uxCheck(defaultSystemRoot());
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return r.ok ? 0 : 1;
}

export async function uxReport(_flags: Record<string, string | boolean>): Promise<number> {
  return uxCheckCmd({});
}

export async function docsCheckCmd(_flags: Record<string, string | boolean>): Promise<number> {
  const r = await docsCheck(defaultSystemRoot());
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return r.ok ? 0 : 1;
}
