import { AnalyzerAgent } from '../../agents/AnalyzerAgent.js';
import { requireProject } from './_shared.js';

export async function analyze(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const agent = new AnalyzerAgent();
  const evidence = flags.evidence === true || flags.evidence === 'true';
  const runCommands = flags.verify === true || flags.verify === 'true';
  const { snapshot, score } = evidence
    ? await agent.fullAnalyzeWithEvidence(project, { runCommands, timeoutMs: 60_000 })
    : await agent.fullAnalyze(project);
  const out = {
    snapshot,
    score,
  };
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  process.stdout.write(`\n>> grade: ${score.grade} (${score.total}/100)\n`);
  return 0;
}
