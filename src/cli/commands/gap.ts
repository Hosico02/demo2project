import { AnalyzerAgent } from '../../agents/AnalyzerAgent.js';
import { requireProject } from './_shared.js';

export async function gap(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const agent = new AnalyzerAgent();
  const fast = flags.fast === true || flags.fast === 'true';
  const noVerify = flags['no-verify'] === true || flags['no-verify'] === 'true' || flags.verify === 'false';
  const evidence = !fast && flags.evidence !== 'false';
  const runCommands = evidence && !noVerify;
  const { gap } = evidence
    ? await agent.fullAnalyzeWithEvidence(project, { runCommands, timeoutMs: 60_000 })
    : await agent.fullAnalyze(project);
  process.stdout.write(JSON.stringify(gap, null, 2) + '\n');
  const maturity = gap.product_maturity
    ? `; product_maturity ${gap.product_maturity.level} (${gap.product_maturity.score}/100, ${gap.product_maturity.domain})`
    : '';
  process.stdout.write(
    `\n>> ${gap.findings.length} finding(s), ${gap.blockers.length} blocker(s); grade ${gap.score.grade} (${gap.score.total}/100)${maturity}\n`,
  );
  return 0;
}
