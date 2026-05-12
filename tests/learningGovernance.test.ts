import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { buildCandidates, decideCandidate, explainCandidate, listCandidates } from '../src/eval/learningGovernance.js';

async function tmpSystem(patterns: object[]): Promise<string> {
  const sys = await fs.mkdtemp(path.join(tmpdir(), 'd2p-gov-'));
  const dir = path.join(sys, 'corpus', 'learning');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'patterns.json'), JSON.stringify(patterns));
  return sys;
}

function fakePattern(over: Partial<{ id: string; type: string; archs: string[]; projects: string[]; support: number; contra: number }> = {}): object {
  return {
    id: over.id ?? 'pat_x',
    title: 'fake',
    pattern_type: over.type ?? 'docs_truth_failure',
    source_projects: over.projects ?? ['p1', 'p2'],
    applicable_archetypes: over.archs ?? ['node-cli'],
    confidence: 0.8,
    support_count: over.support ?? 3,
    contradiction_count: over.contra ?? 0,
    examples: [],
    recommended_action: '...',
    promoted_to_qa_case: false,
    promoted_to_standard_rule: false,
    created_at: '2026-05-12T00:00:00.000Z',
    updated_at: '2026-05-12T00:00:00.000Z',
  };
}

describe('LearningGovernance', () => {
  it('builds repo->workspace candidates when 2+ projects share a pattern', async () => {
    const sys = await tmpSystem([fakePattern({})]);
    const c = await buildCandidates(sys);
    expect(c.some((x) => x.proposed_scope === 'workspace')).toBe(true);
  });
  it('proposes workspace->global only when archetypes >= 3', async () => {
    const sys1 = await tmpSystem([fakePattern({ archs: ['a', 'b'] })]);
    const c1 = await buildCandidates(sys1);
    expect(c1.some((x) => x.proposed_scope === 'global')).toBe(false);
    const sys2 = await tmpSystem([fakePattern({ archs: ['a', 'b', 'c'] })]);
    const c2 = await buildCandidates(sys2);
    expect(c2.some((x) => x.proposed_scope === 'global')).toBe(true);
  });
  it('decide writes back persisted state', async () => {
    const sys = await tmpSystem([fakePattern({})]);
    const cs = await buildCandidates(sys);
    const r = await decideCandidate({ systemRoot: sys, id: cs[0]!.id, decision: 'approved', note: 'ok' });
    expect(r?.decision_status).toBe('approved');
    const after = await listCandidates(sys);
    expect(after[0]!.decision_status).toBe('approved');
  });
  it('explain returns the candidate + source pattern', async () => {
    const sys = await tmpSystem([fakePattern({})]);
    const cs = await buildCandidates(sys);
    const e = await explainCandidate(sys, cs[0]!.id);
    expect(e.candidate?.id).toBe(cs[0]!.id);
    expect(e.pattern?.id).toBe('pat_x');
  });
});
