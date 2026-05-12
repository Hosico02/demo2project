import { AnalyzerAgent } from '../../agents/AnalyzerAgent.js';
import { requireProject } from './_shared.js';

export async function analyze(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const agent = new AnalyzerAgent();
  const snap = await agent.snapshot(project);
  const score = await agent.score(snap);
  const out = {
    snapshot: snap,
    score,
  };
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  process.stdout.write(`\n>> grade: ${score.grade} (${score.total}/100)\n`);
  return 0;
}
