import type { Threat, RiskLevel } from './ThreatCatalog.js';

const WEIGHT: Record<RiskLevel, number> = { low: 1, medium: 3, high: 7, critical: 12 };
const STATUS_DISCOUNT = { mitigated: 0.2, partially_mitigated: 0.6, unmitigated: 1.0, accepted: 0.4 };

export interface ThreatRisk {
  id: string;
  raw_score: number;
  residual_score: number;
  risk_level: RiskLevel;
}

export interface AggregateRisk {
  total_residual: number;
  max_residual: number;
  by_category: Record<string, number>;
  top: ThreatRisk[];
  trust_readiness_score: number;
}

export function scoreThreat(t: Threat): ThreatRisk {
  const raw = WEIGHT[t.likelihood] * WEIGHT[t.impact];
  const residual = raw * STATUS_DISCOUNT[t.status];
  return { id: t.id, raw_score: raw, residual_score: Math.round(residual * 10) / 10, risk_level: t.risk_level };
}

export function aggregate(threats: Threat[]): AggregateRisk {
  const scored = threats.map(scoreThreat);
  const total = scored.reduce((a, b) => a + b.residual_score, 0);
  const max = scored.reduce((a, b) => Math.max(a, b.residual_score), 0);
  const byCat: Record<string, number> = {};
  for (let i = 0; i < threats.length; i++) {
    const cat = threats[i]!.category;
    byCat[cat] = (byCat[cat] ?? 0) + scored[i]!.residual_score;
  }
  const top = [...scored].sort((a, b) => b.residual_score - a.residual_score).slice(0, 5);
  // Trust readiness: 100 means nothing residual, lower as residual grows.
  // Cap denominator to keep scale stable across catalog growth.
  const denom = Math.max(120, threats.length * 5);
  const readiness = Math.max(0, Math.min(100, Math.round(100 - (total / denom) * 100)));
  return { total_residual: Math.round(total * 10) / 10, max_residual: max, by_category: byCat, top, trust_readiness_score: readiness };
}
