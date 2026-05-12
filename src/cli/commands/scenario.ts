import { listScenarios, runScenarioByName, runAllScenarios } from '../../core/scenarioStressTester.js';
import { flagString } from './_shared.js';

export async function scenarioList(_flags: Record<string, string | boolean>): Promise<number> {
  const names = listScenarios();
  process.stdout.write(JSON.stringify({ total: names.length, scenarios: names }, null, 2) + '\n');
  return 0;
}

export async function scenarioRun(flags: Record<string, string | boolean>): Promise<number> {
  const all = flags.all === true || flags.all === 'true';
  if (all) {
    const r = await runAllScenarios();
    process.stdout.write(JSON.stringify(r, null, 2) + '\n');
    return r.failed === 0 ? 0 : 1;
  }
  const name = flagString(flags, 'name');
  if (!name) { process.stderr.write('error: --name <scenario> or --all\n'); return 2; }
  const r = await runScenarioByName(name);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return r.passed ? 0 : 1;
}
