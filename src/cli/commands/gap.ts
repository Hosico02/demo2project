import { AnalyzerAgent } from '../../agents/AnalyzerAgent.js';
import { requireProject } from './_shared.js';

export async function gap(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const agent = new AnalyzerAgent();
  const { gap } = await agent.fullAnalyze(project);
  process.stdout.write(JSON.stringify(gap, null, 2) + '\n');
  process.stdout.write(
    `\n>> ${gap.findings.length} finding(s), ${gap.blockers.length} blocker(s); grade ${gap.score.grade} (${gap.score.total}/100)\n`,
  );
  return 0;
}
