import { THREAT_CATALOG, findThreat } from './ThreatCatalog.js';
import type { Threat } from './ThreatCatalog.js';
import { aggregate, scoreThreat } from './RiskScorer.js';
import type { AggregateRisk } from './RiskScorer.js';

export interface ThreatModelSnapshot {
  generated_at: string;
  total_threats: number;
  unmitigated: number;
  partially_mitigated: number;
  mitigated: number;
  aggregate: AggregateRisk;
  threats: Threat[];
  missing_mitigations: { threat_id: string; missing: string[] }[];
  recommended_tests: string[];
}

export interface ThreatModelOptions {
  projectPath?: string;
  filterCategory?: string;
}

export function buildThreatModel(_opts: ThreatModelOptions = {}): ThreatModelSnapshot {
  const threats = THREAT_CATALOG;
  const agg = aggregate(threats);
  const unmitigated = threats.filter((t) => t.status === 'unmitigated').length;
  const partial = threats.filter((t) => t.status === 'partially_mitigated').length;
  const mit = threats.filter((t) => t.status === 'mitigated').length;
  const missing = threats
    .filter((t) => t.status !== 'mitigated')
    .map((t) => ({
      threat_id: t.id,
      missing: t.mitigations.filter((m) => /partial|todo|missing|tbd/i.test(m)),
    }));
  const recommended = Array.from(new Set(threats.flatMap((t) => t.related_tests))).sort();
  return {
    generated_at: new Date().toISOString(),
    total_threats: threats.length,
    unmitigated,
    partially_mitigated: partial,
    mitigated: mit,
    aggregate: agg,
    threats,
    missing_mitigations: missing,
    recommended_tests: recommended,
  };
}

export function explainThreat(id: string): { threat: Threat; risk_score: number } | null {
  const t = findThreat(id);
  if (!t) return null;
  const s = scoreThreat(t);
  return { threat: t, risk_score: s.residual_score };
}
