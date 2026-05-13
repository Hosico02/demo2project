import path from 'node:path';
import { fileExists } from '../../utils/fs.js';

export interface NextStep {
  command: string;
  reason: string;
  risk: 'low' | 'medium' | 'high';
}

export async function nextSteps(systemRoot: string, projectPath?: string): Promise<NextStep[]> {
  const steps: NextStep[] = [];
  // Detect what's missing and propose accordingly.
  if (!fileExists(path.join(systemRoot, 'dist', 'cli', 'index.js'))) {
    steps.push({ command: 'pnpm build', reason: 'CLI is not built yet', risk: 'low' });
  }
  if (!projectPath) {
    steps.push({ command: 'pnpm demo2project doctor', reason: 'check your environment', risk: 'low' });
    steps.push({ command: 'pnpm demo2project quickstart --use-example', reason: 'try the bad-demo to see the loop', risk: 'low' });
    steps.push({ command: 'pnpm demo2project analyze --project <path>', reason: 'analyze your real project (read-only)', risk: 'low' });
    return steps;
  }
  if (!fileExists(path.join(projectPath, '.demo2project', 'config.json'))) {
    steps.push({ command: `pnpm demo2project init --project ${projectPath}`, reason: 'initialize per-project config', risk: 'low' });
  }
  steps.push({ command: `pnpm demo2project trust:check --project ${projectPath}`, reason: 'evaluate trust level of this repo', risk: 'low' });
  steps.push({ command: `pnpm demo2project analyze --project ${projectPath}`, reason: 'snapshot + score + grade', risk: 'low' });
  steps.push({ command: `pnpm demo2project gap --project ${projectPath}`, reason: 'find what is missing', risk: 'low' });
  steps.push({ command: `pnpm demo2project qa:preflight --project ${projectPath}`, reason: 'load QA cases', risk: 'low' });
  steps.push({ command: `pnpm demo2project iterate --project ${projectPath} --provider rule-based --max-iterations 1`, reason: 'safe demo→project iteration', risk: 'medium' });
  steps.push({ command: 'pnpm demo2project report:project --project <path>', reason: 'generate a shareable report', risk: 'low' });
  return steps;
}

export async function firstRunBanner(): Promise<string> {
  return [
    '👋 Welcome to Demo2Project.',
    '',
    'Demo2Project is a control layer on top of AI coding agents. It scores',
    'your demo, finds gaps, drives a small iteration loop, and refuses to',
    'mark anything done without verification evidence.',
    '',
    'The fastest path:',
    '  1. pnpm demo2project doctor',
    '  2. pnpm demo2project init --interactive',
    '  3. pnpm demo2project quickstart --use-example',
    '',
    'Help: pnpm demo2project --help',
  ].join('\n');
}
