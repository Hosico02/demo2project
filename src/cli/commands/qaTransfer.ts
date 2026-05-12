import { QACaseStore } from '../../qa/QACaseStore.js';
import { detectArchetype } from '../../core/projectArchetypeDetector.js';
import { evaluateTransfer, applicableForArchetype } from '../../qa/QATransferability.js';
import { flagString, requireProject } from './_shared.js';

export async function qaTransfer(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const caseId = flagString(flags, 'case');
  if (!caseId) {
    process.stderr.write('error: --case <id|fingerprint> required\n');
    return 2;
  }
  const arch = (await detectArchetype(project)).primary;
  const cases = await new QACaseStore(project).loadCases();
  const target = cases.find((c) => c.id === caseId || c.fingerprint === caseId);
  if (!target) {
    process.stderr.write('not found\n');
    return 1;
  }
  const d = evaluateTransfer(target, arch);
  process.stdout.write(JSON.stringify({
    project_archetype: arch.id,
    case_id: target.id,
    fingerprint: target.fingerprint,
    decision: d,
  }, null, 2) + '\n');
  return d.applicable ? 0 : 1;
}

export async function qaApplicable(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const arch = (await detectArchetype(project)).primary;
  const cases = await new QACaseStore(project).loadCases();
  const applicable = applicableForArchetype(cases, arch);
  const skipped = cases.filter((c) => !applicable.includes(c));
  process.stdout.write(JSON.stringify({
    project_archetype: arch.id,
    total: cases.length,
    applicable: applicable.map((c) => ({ id: c.id, fingerprint: c.fingerprint })),
    skipped: skipped.map((c) => ({ id: c.id, fingerprint: c.fingerprint, reason: evaluateTransfer(c, arch).reason })),
  }, null, 2) + '\n');
  return 0;
}
