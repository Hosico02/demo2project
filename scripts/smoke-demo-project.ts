/**
 * End-to-end smoke: run the whole pipeline against examples/bad-demo.
 *
 * Usage (after build):
 *   node dist/scripts/smoke-demo-project.js
 * Or via tsx if installed.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AnalyzerAgent } from '../src/agents/AnalyzerAgent.js';
import { PlannerAgent } from '../src/agents/PlannerAgent.js';
import { SupervisorAgent } from '../src/agents/SupervisorAgent.js';
import { MockAgentProvider } from '../src/agents/providers/MockAgentProvider.js';
import { QACaseStore } from '../src/qa/QACaseStore.js';
import { runRegression } from '../src/qa/QARegressionRunner.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const badDemo = path.join(root, 'examples', 'bad-demo');

async function main(): Promise<void> {
  const analyzer = new AnalyzerAgent();
  const planner = new PlannerAgent();
  const { snapshot, score, gap } = await analyzer.fullAnalyze(badDemo);
  console.log('snapshot.detected_language =', snapshot.detected_language);
  console.log('score =', score.total, '(', score.grade, ')');
  console.log('gap findings =', gap.findings.length, 'blockers =', gap.blockers.length);

  const plan = planner.plan(gap, 'project-ready');
  console.log('planned tasks =', plan.tasks.length);

  const supervisor = new SupervisorAgent();
  const summaries = await supervisor.iterate({
    projectPath: badDemo,
    goal: 'project-ready',
    provider: new MockAgentProvider('change_without_verify'),
    maxIterations: 1,
    systemRoot: root,
  });
  console.log('iterations =', summaries.length);
  console.log('qa cases created =', summaries[0]?.qa_cases_created_or_updated);

  const store = new QACaseStore(badDemo);
  const spec = await store.readRegressionSpec(root);
  const reg = await runRegression(badDemo, spec);
  console.log('regression passed =', reg.passed, '/', reg.total, 'failed =', reg.failed);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
