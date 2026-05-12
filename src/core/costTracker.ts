import path from 'node:path';
import { writeJson, readJsonSafe } from '../utils/json.js';
import { ensureDir } from '../utils/fs.js';
import { stateDir } from '../utils/paths.js';
import { promises as fs } from 'node:fs';

/**
 * CostTracker (Phase 4) — record time + counters per iteration.
 *
 * No external token API call is made. `token_estimate` is a coarse
 * char-count approximation; `cost_estimate_usd` is illustrative only.
 *
 * Persists at `<project>/.demo2project/cost/<iteration_id>.json`.
 */

export interface CostRecord {
  iteration_id: string;
  wall_time_ms: number;
  command_time_ms: number;
  provider_time_ms: number;
  token_estimate: number;
  command_count: number;
  retry_count: number;
  rollback_count: number;
  cost_estimate_usd: number;
  cost_per_score_point?: number;
  cost_per_fixed_defect?: number;
  defects_fixed?: number;
  score_delta?: number;
  started_at: string;
  finished_at: string;
}

export class CostTracker {
  private wallStart = Date.now();
  private commandMs = 0;
  private providerMs = 0;
  private tokens = 0;
  private commands = 0;
  private retries = 0;
  private rollbacks = 0;

  constructor(public readonly iterationId: string) {}

  addCommand(ms: number, tokens = 0): void {
    this.commandMs += ms;
    this.tokens += tokens;
    this.commands++;
  }

  addProviderCall(ms: number, tokens = 0): void {
    this.providerMs += ms;
    this.tokens += tokens;
  }

  noteRetry(): void { this.retries++; }
  noteRollback(): void { this.rollbacks++; }
  noteTokens(n: number): void { this.tokens += n; }

  finalize(opts: { defects_fixed?: number; score_delta?: number } = {}): CostRecord {
    const finished = Date.now();
    const wall = finished - this.wallStart;
    // illustrative pricing: $3 per million tokens. Real callers should
    // override after attaching a real provider.
    const cost = (this.tokens / 1_000_000) * 3;
    const rec: CostRecord = {
      iteration_id: this.iterationId,
      wall_time_ms: wall,
      command_time_ms: this.commandMs,
      provider_time_ms: this.providerMs,
      token_estimate: this.tokens,
      command_count: this.commands,
      retry_count: this.retries,
      rollback_count: this.rollbacks,
      cost_estimate_usd: Number(cost.toFixed(6)),
      started_at: new Date(this.wallStart).toISOString(),
      finished_at: new Date(finished).toISOString(),
      defects_fixed: opts.defects_fixed,
      score_delta: opts.score_delta,
    };
    if ((opts.score_delta ?? 0) > 0) rec.cost_per_score_point = Number((cost / (opts.score_delta ?? 1)).toFixed(6));
    if ((opts.defects_fixed ?? 0) > 0) rec.cost_per_fixed_defect = Number((cost / (opts.defects_fixed ?? 1)).toFixed(6));
    return rec;
  }

  static async persist(projectPath: string, record: CostRecord): Promise<string> {
    const dir = path.join(stateDir(projectPath), 'cost');
    await ensureDir(dir);
    const p = path.join(dir, `${record.iteration_id}.json`);
    await writeJson(p, record);
    return p;
  }

  static async readAll(projectPath: string): Promise<CostRecord[]> {
    const dir = path.join(stateDir(projectPath), 'cost');
    let entries: string[] = [];
    try { entries = await fs.readdir(dir); } catch { return []; }
    const out: CostRecord[] = [];
    for (const f of entries.filter((e) => e.endsWith('.json'))) {
      const r = await readJsonSafe<CostRecord>(path.join(dir, f));
      if (r) out.push(r);
    }
    return out;
  }
}
