import path from 'node:path';
import type { AgentName } from './types.js';
import { ensureDir } from '../utils/fs.js';
import { writeJson, readJsonSafe } from '../utils/json.js';
import { stateDir } from '../utils/paths.js';
import { nowIso, shortId } from '../utils/time.js';

/**
 * Evidence Graph (Phase 4) — every conclusion the system makes must have
 * a traceable evidence chain.
 *
 *   EvidenceNode = a single observation (a command exit code, a file
 *     hash, a docs-truth result, a QA case fingerprint).
 *
 *   ClaimNode   = a statement the system asserts ("test_score = 18",
 *     "README mentions docker build" ). Each claim cites one or more
 *     evidence nodes.
 *
 * The graph is persisted per iteration at
 * `<project>/.demo2project/evidence/<iteration_id>.json`.
 *
 * Design choices:
 *   - Plain JSON, no graph DB. Edge data lives inside the claim node
 *     (`evidence_ids: string[]`).
 *   - Append-only inside a single iteration; we never mutate written
 *     evidence in place — we mark `invalidated_at` on the claim instead.
 *   - The graph itself does NOT do inference; it is a record, not a
 *     reasoner. Other code is free to derive views from it.
 */

export type EvidenceType =
  | 'command'
  | 'file'
  | 'diff'
  | 'test'
  | 'qa_case'
  | 'review'
  | 'score'
  | 'docs_claim'
  | 'finding'
  | 'note';

export type Confidence = 'high' | 'medium' | 'low';
export type ClaimStatus = 'verified' | 'unverified' | 'contradicted' | 'stale';

export interface EvidenceNode {
  id: string;
  type: EvidenceType;
  timestamp: string;
  source_agent: AgentName | 'system';
  content_summary: string;
  raw_ref?: string; // path or event id pointing at fuller data
  confidence: Confidence;
  related_files?: string[];
  metadata?: Record<string, unknown>;
}

export interface ClaimNode {
  id: string;
  claim: string;
  status: ClaimStatus;
  evidence_ids: string[];
  confidence: Confidence;
  created_at: string;
  invalidated_at?: string;
  metadata?: Record<string, unknown>;
}

export interface EvidenceGraphFile {
  iteration_id: string;
  generated_at: string;
  evidence: EvidenceNode[];
  claims: ClaimNode[];
}

export class EvidenceGraph {
  private nodes: EvidenceNode[] = [];
  private claims: ClaimNode[] = [];

  constructor(public readonly iterationId: string) {}

  static path(projectPath: string, iterationId: string): string {
    return path.join(stateDir(projectPath), 'evidence', `${iterationId}.json`);
  }

  addEvidence(input: Omit<EvidenceNode, 'id' | 'timestamp'> & Partial<Pick<EvidenceNode, 'id' | 'timestamp'>>): EvidenceNode {
    const node: EvidenceNode = {
      id: input.id ?? shortId('ev'),
      timestamp: input.timestamp ?? nowIso(),
      type: input.type,
      source_agent: input.source_agent,
      content_summary: input.content_summary,
      raw_ref: input.raw_ref,
      confidence: input.confidence,
      related_files: input.related_files,
      metadata: input.metadata,
    };
    this.nodes.push(node);
    return node;
  }

  addClaim(input: Omit<ClaimNode, 'id' | 'created_at'> & Partial<Pick<ClaimNode, 'id' | 'created_at'>>): ClaimNode {
    const claim: ClaimNode = {
      id: input.id ?? shortId('cl'),
      created_at: input.created_at ?? nowIso(),
      claim: input.claim,
      status: input.status,
      evidence_ids: input.evidence_ids,
      confidence: input.confidence,
      metadata: input.metadata,
    };
    this.claims.push(claim);
    return claim;
  }

  invalidate(claimId: string): void {
    const c = this.claims.find((x) => x.id === claimId);
    if (c) {
      c.status = 'contradicted';
      c.invalidated_at = nowIso();
    }
  }

  toFile(): EvidenceGraphFile {
    return {
      iteration_id: this.iterationId,
      generated_at: nowIso(),
      evidence: this.nodes,
      claims: this.claims,
    };
  }

  async persist(projectPath: string): Promise<string> {
    const p = EvidenceGraph.path(projectPath, this.iterationId);
    await ensureDir(path.dirname(p));
    await writeJson(p, this.toFile());
    return p;
  }

  static async load(projectPath: string, iterationId: string): Promise<EvidenceGraphFile | null> {
    return readJsonSafe<EvidenceGraphFile>(EvidenceGraph.path(projectPath, iterationId));
  }

  static fromFile(f: EvidenceGraphFile): EvidenceGraph {
    const g = new EvidenceGraph(f.iteration_id);
    g.nodes = [...f.evidence];
    g.claims = [...f.claims];
    return g;
  }

  explainClaim(claimId: string): { claim: ClaimNode | null; evidence: EvidenceNode[] } {
    const claim = this.claims.find((c) => c.id === claimId) ?? null;
    if (!claim) return { claim: null, evidence: [] };
    const evidence = this.nodes.filter((n) => claim.evidence_ids.includes(n.id));
    return { claim, evidence };
  }
}
