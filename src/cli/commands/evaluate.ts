import path from 'node:path';
import { runEvaluation } from '../../eval/evaluationRunner.js';
import { writeEvaluationReport } from '../../eval/reportWriter.js';
import { flagString, flagNumber } from './_shared.js';

export async function evaluate(flags: Record<string, string | boolean>): Promise<number> {
  const systemRoot = path.resolve(new URL('../../..', import.meta.url).pathname);
  const all = flags.all === true || flags.all === 'true';
  const caseName = flagString(flags, 'case');
  if (!all && !caseName) {
    process.stderr.write('error: pass --all or --case <name>\n');
    return 2;
  }
  const rows = await runEvaluation({
    systemRoot,
    caseName: all ? undefined : caseName,
    maxIterations: flagNumber(flags, 'max-iterations', 3),
    runVerificationCommands: flags['run-verify'] === true || flags['run-verify'] === 'true',
  });
  const paths = await writeEvaluationReport(systemRoot, rows);
  process.stdout.write(JSON.stringify({ rows, report: paths }, null, 2) + '\n');
  process.stdout.write('\n');
  process.stdout.write('case'.padEnd(28) + 'baseline'.padEnd(14) + 'demo2project'.padEnd(14) + 'Δ'.padEnd(6) + 'verdict\n');
  process.stdout.write('-'.repeat(80) + '\n');
  for (const r of rows) {
    process.stdout.write(
      r.case.padEnd(28) +
        `${r.baseline_score_before}→${r.baseline_score_after}`.padEnd(14) +
        `${r.demo2project_score_before}→${r.demo2project_score_after}`.padEnd(14) +
        `${r.delta_score >= 0 ? '+' : ''}${r.delta_score}`.padEnd(6) +
        r.recommendation +
        '\n',
    );
  }
  return 0;
}
