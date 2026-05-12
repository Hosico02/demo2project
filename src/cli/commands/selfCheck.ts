import path from 'node:path';
import { AnalyzerAgent } from '../../agents/AnalyzerAgent.js';
import { QACaseStore } from '../../qa/QACaseStore.js';
import { runRegression } from '../../qa/QARegressionRunner.js';

/**
 * Self-check: run analyze + gap + regression against the demo2project
 * repository itself. Demonstrates that the system can iterate on itself —
 * the foundation of Phase 5 (self-iteration).
 */
export async function selfCheck(_flags: Record<string, string | boolean>): Promise<number> {
  const root = defaultSystemRoot();
  const analyzer = new AnalyzerAgent();
  const { snapshot, score, gap } = await analyzer.fullAnalyze(root);
  const store = new QACaseStore(root);
  const spec = await store.readRegressionSpec(root);
  const regression = await runRegression(root, spec);

  const report = {
    self_path: root,
    detected_language: snapshot.detected_language,
    package_manager: snapshot.package_manager,
    score: score.total,
    grade: score.grade,
    blockers: gap.blockers.length,
    findings: gap.findings.length,
    qa_regression: {
      total: regression.total,
      passed: regression.passed,
      failed: regression.failed,
    },
  };
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  return regression.failed === 0 ? 0 : 1;
}

function defaultSystemRoot(): string {
  // dist/cli/commands/selfCheck.js → up 3 directories = project root
  return path.resolve(new URL('../../..', import.meta.url).pathname);
}
