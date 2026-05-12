import path from 'node:path';
import { runRegression } from '../../qa/QARegressionRunner.js';
import { QACaseStore } from '../../qa/QACaseStore.js';
import { flagString, requireProject } from './_shared.js';

export async function qaRegression(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const systemRoot = flagString(flags, 'system-root', defaultSystemRoot())!;

  const store = new QACaseStore(project);
  const spec = await store.readRegressionSpec(systemRoot);
  const result = await runRegression(project, spec);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.stdout.write(
    `\n>> ${result.passed}/${result.total} passed, ${result.failed} failed\n`,
  );
  return result.failed === 0 ? 0 : 1;
}

function defaultSystemRoot(): string {
  return path.resolve(new URL('../../..', import.meta.url).pathname);
}
