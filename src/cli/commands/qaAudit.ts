import path from 'node:path';
import { QACaseStore } from '../../qa/QACaseStore.js';
import { recomputeLifecycle, retire, promote, shouldAutoRetire } from '../../qa/QACaseLifecycle.js';
import type { QACase } from '../../core/types.js';
import { flagString, requireProject } from './_shared.js';

export async function qaAudit(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const apply = flags.apply === true || flags.apply === 'true';
  const store = new QACaseStore(project);
  const cases = await store.loadCases();
  const audited = cases.map(recomputeLifecycle);
  const retiredCandidates: QACase[] = [];
  for (let i = 0; i < audited.length; i++) {
    const c = audited[i]!;
    const decision = shouldAutoRetire(c);
    if (decision.retire) {
      retiredCandidates.push({ ...c, retired_at: '(would-retire)', retirement_reason: decision.reason });
      if (apply) audited[i] = retire(c, decision.reason ?? 'auto');
    }
  }
  if (apply) await store.saveCases(audited);
  const out = {
    project_path: project,
    total: audited.length,
    by_lifecycle: bucket(audited),
    auto_retire_candidates: retiredCandidates.map((c) => ({
      id: c.id,
      fingerprint: c.fingerprint,
      reason: c.retirement_reason,
    })),
    applied: apply,
  };
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  return 0;
}

export async function qaRetire(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const caseId = flagString(flags, 'case');
  const reason = flagString(flags, 'reason', 'manual') ?? 'manual';
  if (!caseId) {
    process.stderr.write('error: --case <id> required\n');
    return 2;
  }
  const store = new QACaseStore(project);
  const cases = await store.loadCases();
  const idx = cases.findIndex((c) => c.id === caseId || c.fingerprint === caseId);
  if (idx === -1) {
    process.stderr.write(`error: no case with id/fingerprint matching "${caseId}"\n`);
    return 1;
  }
  cases[idx] = retire(cases[idx]!, reason);
  await store.saveCases(cases);
  process.stdout.write(JSON.stringify({ retired: cases[idx]!.id, reason }, null, 2) + '\n');
  return 0;
}

export async function qaPromote(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const caseId = flagString(flags, 'case');
  if (!caseId) {
    process.stderr.write('error: --case <id> required\n');
    return 2;
  }
  const store = new QACaseStore(project);
  const cases = await store.loadCases();
  const idx = cases.findIndex((c) => c.id === caseId || c.fingerprint === caseId);
  if (idx === -1) {
    process.stderr.write(`error: no case with id/fingerprint matching "${caseId}"\n`);
    return 1;
  }
  cases[idx] = promote(cases[idx]!);
  await store.saveCases(cases);
  process.stdout.write(JSON.stringify({ promoted: cases[idx]!.id }, null, 2) + '\n');
  return 0;
}

function bucket(cases: QACase[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of cases) {
    const k = c.lifecycle ?? c.status ?? 'unknown';
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
