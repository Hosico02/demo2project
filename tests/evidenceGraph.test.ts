import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { EvidenceGraph } from '../src/core/evidenceGraph.js';

async function tmp() { return fs.mkdtemp(path.join(tmpdir(), 'd2p-eg-')); }

describe('EvidenceGraph', () => {
  it('adds evidence and claims that cite them', () => {
    const g = new EvidenceGraph('iter_t1');
    const e = g.addEvidence({ type: 'command', source_agent: 'verifier', content_summary: 'pnpm test → exit 0', confidence: 'high' });
    const c = g.addClaim({ claim: 'tests pass', status: 'verified', evidence_ids: [e.id], confidence: 'high' });
    expect(g.explainClaim(c.id).evidence[0]!.id).toBe(e.id);
  });

  it('persists and re-loads from disk', async () => {
    const proj = await tmp();
    const g = new EvidenceGraph('iter_t2');
    g.addEvidence({ type: 'score', source_agent: 'analyzer', content_summary: 'total=42', confidence: 'high' });
    await g.persist(proj);
    const file = await EvidenceGraph.load(proj, 'iter_t2');
    expect(file?.evidence.length).toBe(1);
  });

  it('invalidate marks contradicted', () => {
    const g = new EvidenceGraph('iter_t3');
    const e = g.addEvidence({ type: 'command', source_agent: 'verifier', content_summary: 'x', confidence: 'high' });
    const c = g.addClaim({ claim: 'x', status: 'verified', evidence_ids: [e.id], confidence: 'high' });
    g.invalidate(c.id);
    const updated = g.toFile().claims.find((x) => x.id === c.id)!;
    expect(updated.status).toBe('contradicted');
    expect(updated.invalidated_at).toBeTruthy();
  });
});
