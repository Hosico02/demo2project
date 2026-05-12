import path from 'node:path';
import { runGeneralization } from '../../eval/generalization.js';
import { flagString } from './_shared.js';
import { writeJson } from '../../utils/json.js';
import { ensureDir, writeText } from '../../utils/fs.js';

export async function generalize(flags: Record<string, string | boolean>): Promise<number> {
  const systemRoot = path.resolve(new URL('../../..', import.meta.url).pathname);
  const archetype = flagString(flags, 'archetype');
  const writeReport = flags.report === true || flags.report === 'true';
  const r = await runGeneralization({ systemRoot, archetype });
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  if (writeReport) {
    const dir = path.join(systemRoot, 'reports', 'workspace');
    await ensureDir(dir);
    await writeJson(path.join(dir, 'generalization-report.json'), r);
    const md = [
      '# Generalization report',
      '',
      `Generated: ${new Date().toISOString()}`,
      '',
      `- Total projects: **${r.total_projects}**`,
      `- Average score after: **${r.average_score_after}**`,
      `- docs_truth_failure_rate: ${(r.docs_truth_failure_rate * 100).toFixed(0)}%`,
      '',
      '## By archetype',
      '',
      ...Object.entries(r.projects_by_archetype).map(([a, n]) => `- ${a}: ${n} (success ${(r.success_rate_by_archetype[a] ?? 0) * 100}%)`),
      '',
      '## Weakest archetypes',
      '',
      ...r.weakest_archetypes.map((a) => `- ${a}`),
      '',
      '## Recommended standard updates',
      '',
      ...r.recommended_standard_updates.map((s) => `- ${s}`),
      '',
    ].join('\n');
    await writeText(path.join(dir, 'generalization-report.md'), md);
    process.stdout.write(`\nwrote ${path.join(dir, 'generalization-report.md')}\n`);
  }
  return 0;
}
