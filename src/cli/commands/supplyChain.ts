import { scan, diff as scDiff, writeReport } from '../../security/supply-chain/SupplyChainReport.js';
import { requireProject, flagString } from './_shared.js';

export async function supplyChainScan(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = requireProject(flags);
  if (!projectPath) return 2;
  const data = await scan(projectPath);
  process.stdout.write(JSON.stringify({ deps: data.dependencies, scripts: data.scripts, recommendations: data.recommendations }, null, 2) + '\n');
  return 0;
}

export async function supplyChainDiff(flags: Record<string, string | boolean>): Promise<number> {
  const before = flagString(flags, 'before');
  const after = flagString(flags, 'after');
  if (!before || !after) { process.stderr.write('--before <path> --after <path> required\n'); return 2; }
  const r = await scDiff(before, after);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function supplyChainReport(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = requireProject(flags);
  if (!projectPath) return 2;
  const data = await scan(projectPath);
  const out = await writeReport(projectPath, data);
  process.stdout.write(JSON.stringify({ summary: { suspect: data.dependencies.suspect, lifecycle: data.scripts.lifecycle_scripts.length, recs: data.recommendations.length }, report: out }, null, 2) + '\n');
  return 0;
}
