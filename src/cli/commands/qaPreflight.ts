import { QACaseStore } from '../../qa/QACaseStore.js';
import { requireProject } from './_shared.js';

export async function qaPreflight(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const store = new QACaseStore(project);
  const cases = await store.loadCases();
  const active = cases.filter((c) => c.status === 'active');
  process.stdout.write(
    JSON.stringify(
      {
        project_path: project,
        total_cases: cases.length,
        active_cases: active.length,
        active_fingerprints: active.map((c) => c.fingerprint),
      },
      null,
      2,
    ) + '\n',
  );
  return 0;
}
