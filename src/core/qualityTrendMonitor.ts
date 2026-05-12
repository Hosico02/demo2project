import path from 'node:path';
import { promises as fs } from 'node:fs';
import { writeJson, readJsonSafe } from '../utils/json.js';
import { ensureDir } from '../utils/fs.js';
import { stateDir } from '../utils/paths.js';
import { nowIso } from '../utils/time.js';

/**
 * QualityTrendMonitor (Phase 6) — keeps a rolling window of per-iteration
 * quality snapshots so a long-horizon controller can detect score drops,
 * plateaus, drift, and decay.
 *
 * Stored at `<project>/.demo2project/trend/<session_id>.json` as an
 * append-only array of snapshots, plus a derived decision.
 */

export interface QualityTrendSnapshot {
  iteration_id: string;
  timestamp: string;
  project_score: number;
  confidence_adjusted_score: number;
  verification_pass_rate: number;
  regression_count: number;
  docs_truth_score: number;
  test_quality_score: number;
  architecture_drift_score: number;
  dependency_bloat_score: number;
  qa_memory_noise_score: number;
  cost_per_score_point: number;
  risk_level: 'low' | 'medium' | 'high' | 'blocker';
  evidence_ids: string[];
}

export type TrendDecisionKind =
  | 'continue'
  | 'stop'
  | 'rollback'
  | 'request_approval'
  | 'switch_executor'
  | 'reduce_scope'
  | 'run_diagnostics';

export interface QualityTrendDecision {
  kind: TrendDecisionKind;
  reason: string;
  signals: string[];
}

export class QualityTrendMonitor {
  constructor(private projectPath: string, private sessionId: string) {}

  private filepath(): string {
    return path.join(stateDir(this.projectPath), 'trend', `${this.sessionId}.json`);
  }

  async load(): Promise<QualityTrendSnapshot[]> {
    return (await readJsonSafe<QualityTrendSnapshot[]>(this.filepath())) ?? [];
  }

  async append(s: QualityTrendSnapshot): Promise<QualityTrendSnapshot[]> {
    const all = await this.load();
    all.push(s);
    await ensureDir(path.dirname(this.filepath()));
    await writeJson(this.filepath(), all);
    return all;
  }

  /**
   * Decide what to do next based on the trend window. The caller (controller)
   * passes the autonomy policy thresholds.
   */
  decide(snapshots: QualityTrendSnapshot[], policy: {
    score_window_size: number;
    min_score_improvement_per_window: number;
    max_regressions_allowed: number;
    rollback_on_score_drop: boolean;
  }): QualityTrendDecision {
    if (snapshots.length === 0) {
      return { kind: 'continue', reason: 'no snapshots yet', signals: [] };
    }
    const last = snapshots[snapshots.length - 1]!;
    const totalRegressions = snapshots.reduce((a, s) => a + s.regression_count, 0);
    if (totalRegressions > policy.max_regressions_allowed) {
      return {
        kind: policy.rollback_on_score_drop ? 'rollback' : 'stop',
        reason: `regressions ${totalRegressions} exceed max ${policy.max_regressions_allowed}`,
        signals: ['regression_threshold'],
      };
    }
    if (last.risk_level === 'blocker') {
      return { kind: 'request_approval', reason: 'blocker risk', signals: ['risk_level=blocker'] };
    }
    if (snapshots.length >= 2) {
      const prev = snapshots[snapshots.length - 2]!;
      if (last.project_score < prev.project_score - 1) {
        return {
          kind: policy.rollback_on_score_drop ? 'rollback' : 'stop',
          reason: `score dropped ${prev.project_score} → ${last.project_score}`,
          signals: ['score_drop'],
        };
      }
    }
    if (snapshots.length >= policy.score_window_size) {
      const window = snapshots.slice(-policy.score_window_size);
      const delta = window[window.length - 1]!.project_score - window[0]!.project_score;
      if (delta < policy.min_score_improvement_per_window) {
        return {
          kind: 'stop',
          reason: `plateau: Δscore ${delta} over last ${policy.score_window_size} iterations`,
          signals: ['score_plateau'],
        };
      }
    }
    if (last.architecture_drift_score >= 7) {
      return { kind: 'run_diagnostics', reason: 'architecture drift high', signals: ['arch_drift_high'] };
    }
    if (last.qa_memory_noise_score >= 0.5) {
      return { kind: 'run_diagnostics', reason: 'qa memory noisy', signals: ['qa_noise'] };
    }
    return { kind: 'continue', reason: 'within policy bounds', signals: [] };
  }
}

export function snapshotFromBasics(input: {
  iterationId: string;
  projectScore: number;
  confidenceAdjusted?: number;
  verificationPassRate?: number;
  regressionCount?: number;
  docsTruthScore?: number;
  testQualityScore?: number;
  architectureDriftScore?: number;
  dependencyBloatScore?: number;
  qaMemoryNoiseScore?: number;
  costPerScorePoint?: number;
  riskLevel?: QualityTrendSnapshot['risk_level'];
  evidenceIds?: string[];
}): QualityTrendSnapshot {
  return {
    iteration_id: input.iterationId,
    timestamp: nowIso(),
    project_score: input.projectScore,
    confidence_adjusted_score: input.confidenceAdjusted ?? input.projectScore,
    verification_pass_rate: input.verificationPassRate ?? 1,
    regression_count: input.regressionCount ?? 0,
    docs_truth_score: input.docsTruthScore ?? 0,
    test_quality_score: input.testQualityScore ?? 0,
    architecture_drift_score: input.architectureDriftScore ?? 0,
    dependency_bloat_score: input.dependencyBloatScore ?? 0,
    qa_memory_noise_score: input.qaMemoryNoiseScore ?? 0,
    cost_per_score_point: input.costPerScorePoint ?? 0,
    risk_level: input.riskLevel ?? 'low',
    evidence_ids: input.evidenceIds ?? [],
  };
}
