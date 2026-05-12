import { AnalyzerAgent } from '../../agents/AnalyzerAgent.js';
import { PlannerAgent } from '../../agents/PlannerAgent.js';
import { flagString, requireProject } from './_shared.js';

export async function plan(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const goal = flagString(flags, 'goal', 'turn demo into project-ready baseline')!;
  const analyzer = new AnalyzerAgent();
  const planner = new PlannerAgent();
  const { gap } = await analyzer.fullAnalyze(project);
  const p = planner.plan(gap, goal);
  process.stdout.write(JSON.stringify(p, null, 2) + '\n');
  process.stdout.write(`\n>> planned ${p.tasks.length} task(s) (risk=${p.risk_level}, expected_delta=${p.expected_score_delta})\n`);
  return 0;
}
