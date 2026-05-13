/**
 * Lockfile change analyzer.
 *
 * Compares two lockfile texts (before/after) and reports how many lines/
 * entries changed. The intent is to flag mass mutations that could hide
 * a typo-squat dependency among legitimate updates.
 */

export interface LockfileChangeReport {
  before_size: number;
  after_size: number;
  delta_lines: number;
  delta_ratio: number;
  large_change: boolean;
}

export function analyzeLockfileChange(before: string, after: string): LockfileChangeReport {
  const a = before.split('\n').length;
  const b = after.split('\n').length;
  const delta = Math.abs(a - b);
  const ratio = a === 0 ? (b > 0 ? 1 : 0) : delta / a;
  return {
    before_size: a,
    after_size: b,
    delta_lines: delta,
    delta_ratio: Math.round(ratio * 1000) / 1000,
    large_change: ratio > 0.2,
  };
}
