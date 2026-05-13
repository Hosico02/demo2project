import path from 'node:path';
import { AnalyzerAgent } from '../../agents/AnalyzerAgent.js';
import { evaluateTrust } from '../../security/untrusted/RepositoryTrustEvaluator.js';
import { reportMemoryHealth } from '../../qa/QAMemoryHealth.js';

export interface QuickstartStep {
  name: string;
  command: string;
  output_summary: string;
  ok: boolean;
}

export interface QuickstartResult {
  generated_at: string;
  project_path: string;
  steps: QuickstartStep[];
  score: number;
  grade: string;
  trust_level: string;
  next_steps: string[];
  what_demo2project_found: string;
  what_it_means: string;
  what_is_safe_to_run: string[];
  what_requires_approval: string[];
}

export async function runQuickstart(opts: { systemRoot: string; projectPath?: string; useExample?: boolean }): Promise<QuickstartResult> {
  const projectPath = opts.projectPath ?? path.join(opts.systemRoot, 'examples', 'bad-demo');
  const steps: QuickstartStep[] = [];
  const analyzer = new AnalyzerAgent();
  const a = await analyzer.fullAnalyze(projectPath);
  steps.push({ name: 'analyze', command: `analyze --project ${projectPath}`, output_summary: `score ${a.score.total} grade ${a.score.grade}`, ok: true });
  steps.push({ name: 'gap', command: `gap --project ${projectPath}`, output_summary: `${a.gap.findings.length} finding(s) ${a.gap.blockers.length} blocker(s)`, ok: true });
  const trust = await evaluateTrust(projectPath);
  steps.push({ name: 'trust:check', command: `trust:check --project ${projectPath}`, output_summary: `trust=${trust.trust_level}`, ok: true });
  const qa = await reportMemoryHealth(projectPath);
  steps.push({ name: 'qa:preflight', command: `qa:preflight --project ${projectPath}`, output_summary: `${qa.total_cases} QA case(s)`, ok: true });
  return {
    generated_at: new Date().toISOString(),
    project_path: projectPath,
    steps,
    score: a.score.total,
    grade: a.score.grade,
    trust_level: trust.trust_level,
    next_steps: [
      `pnpm demo2project iterate --project ${projectPath} --provider rule-based --max-iterations 1`,
      `pnpm demo2project report:project --project ${projectPath}`,
      `pnpm demo2project trust:report --project ${projectPath}`,
    ],
    what_demo2project_found: `Project '${path.basename(projectPath)}' scored ${a.score.total}/100 (${a.score.grade}). ${a.gap.findings.length} gap(s) identified. Trust level: ${trust.trust_level}.`,
    what_it_means: a.score.total < 50 ? 'This is closer to a demo than a project. Iteration could raise the score.' : 'This is already structured but has gaps worth addressing.',
    what_is_safe_to_run: [
      'analyze / gap / score (read-only)',
      'qa:preflight / qa:regression (read-only)',
      'iterate --provider rule-based (writes only safe scaffolding)',
    ],
    what_requires_approval: [
      'edits to safety.ts / redaction.ts / policy files',
      'global QA memory updates',
      'self-iteration of Demo2Project itself',
      'package install / network access in untrusted repos',
    ],
  };
}
