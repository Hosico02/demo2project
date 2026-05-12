import { runDocsTruth } from '../../core/docsTruth.js';
import { requireProject } from './_shared.js';

export async function docsTruth(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const report = await runDocsTruth(project);
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(
    `\n>> ${report.passed}/${report.total_claims} docs claims verified, ${report.missing} missing evidence\n`,
  );
  return report.missing > 0 ? 1 : 0;
}
