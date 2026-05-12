import path from 'node:path';
import { promises as fs } from 'node:fs';
import { AnalyzerAgent } from '../../agents/AnalyzerAgent.js';

/**
 * Phase-6 slice: score every example project and print a table. This is
 * the seed of the benchmark suite — measure score deltas as the official
 * progress metric. Future phases will add before/after pairs and CI.
 */
export async function benchmark(_flags: Record<string, string | boolean>): Promise<number> {
  const root = path.resolve(new URL('../../..', import.meta.url).pathname);
  const examplesDir = path.join(root, 'examples');
  let entries: string[];
  try {
    entries = await fs.readdir(examplesDir);
  } catch {
    process.stderr.write(`no examples/ directory at ${examplesDir}\n`);
    return 1;
  }
  const analyzer = new AnalyzerAgent();
  const rows: { project: string; score: number; grade: string; blockers: number; findings: number }[] = [];
  for (const e of entries) {
    const p = path.join(examplesDir, e);
    const stat = await fs.stat(p).catch(() => null);
    if (!stat || !stat.isDirectory()) continue;
    const { score, gap } = await analyzer.fullAnalyze(p);
    rows.push({
      project: `examples/${e}`,
      score: score.total,
      grade: score.grade,
      blockers: gap.blockers.length,
      findings: gap.findings.length,
    });
  }
  const out = { evaluated_at: new Date().toISOString(), rows };
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  // Also print a small ASCII table for humans
  process.stdout.write('\n');
  process.stdout.write('project'.padEnd(36) + 'score  grade                          blockers  findings\n');
  process.stdout.write('-'.repeat(96) + '\n');
  for (const r of rows) {
    process.stdout.write(
      r.project.padEnd(36) +
        String(r.score).padEnd(7) +
        r.grade.padEnd(32) +
        String(r.blockers).padEnd(10) +
        String(r.findings) +
        '\n',
    );
  }
  return 0;
}
