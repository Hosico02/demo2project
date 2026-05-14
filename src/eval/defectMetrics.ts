import type { GapFinding } from '../core/types.js';

export interface KnownDefect {
  id?: string;
  defect_id?: string;
  category: string;
  severity?: string;
}

export interface DefectMetricResult {
  defects_known: number;
  defects_detected: number;
  defects_fixed: number;
  defects_remaining: number;
  discovery_rate: number;
  fix_rate: number;
  detected_ids: string[];
  remaining_ids: string[];
}

export function calculateDefectMetrics(input: {
  knownDefects: KnownDefect[];
  findingsBefore: GapFinding[];
  findingsAfter: GapFinding[];
  docsBeforeMissing?: number;
  docsAfterMissing?: number;
}): DefectMetricResult {
  const beforeCats = new Set(input.findingsBefore.map((f) => f.category));
  const afterCats = new Set(input.findingsAfter.map((f) => f.category));
  const detected = input.knownDefects.filter((d) =>
    defectPresent(d, beforeCats, input.docsBeforeMissing ?? 0),
  );
  const remaining = input.knownDefects.filter((d) =>
    defectPresent(d, afterCats, input.docsAfterMissing ?? 0),
  );
  const fixed = detected.filter((d) => !remaining.includes(d));
  return {
    defects_known: input.knownDefects.length,
    defects_detected: detected.length,
    defects_fixed: fixed.length,
    defects_remaining: remaining.length,
    discovery_rate: rate(detected.length, input.knownDefects.length),
    fix_rate: rate(fixed.length, detected.length),
    detected_ids: detected.map(defectId),
    remaining_ids: remaining.map(defectId),
  };
}

export function defectId(defect: KnownDefect): string {
  return defect.defect_id ?? defect.id ?? defect.category;
}

function defectPresent(defect: KnownDefect, categories: Set<string>, docsMissing: number): boolean {
  if (defect.category === 'docs_lie') return docsMissing > 0;
  return categories.has(defect.category);
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(3));
}
