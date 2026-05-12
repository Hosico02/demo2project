import path from 'node:path';
import { writeText, fileExists } from '../../utils/fs.js';
import { writeJson } from '../../utils/json.js';
import { DEFAULT_PROJECT_STANDARD } from '../../standards/defaultProjectStandard.js';

export async function init(flags: Record<string, string | boolean>): Promise<number> {
  const root = (typeof flags.dir === 'string' ? flags.dir : '.') as string;
  const standardPath = path.join(root, 'config', 'project-standard.json');
  const policyPath = path.join(root, 'config', 'iteration-policy.json');

  let wrote = 0;
  if (!fileExists(standardPath)) {
    await writeJson(standardPath, DEFAULT_PROJECT_STANDARD);
    wrote++;
  }
  if (!fileExists(policyPath)) {
    await writeJson(policyPath, {
      max_iterations: 3,
      stop_on_grade: 'production_ready_baseline',
      no_progress_window: 2,
      default_provider: 'mock',
    });
    wrote++;
  }

  const readmeStub = path.join(root, 'docs', 'iteration-process.md');
  if (!fileExists(readmeStub)) {
    await writeText(readmeStub, '# Iteration process\n\nSee README for the closed-loop overview.\n');
    wrote++;
  }

  process.stdout.write(`init complete (${wrote} file(s) written, others already existed)\n`);
  return 0;
}
