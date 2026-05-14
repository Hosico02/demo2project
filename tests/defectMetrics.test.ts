import { describe, it, expect } from 'vitest';
import { calculateDefectMetrics } from '../src/eval/defectMetrics.js';
import type { GapFinding } from '../src/core/types.js';

function finding(category: string): GapFinding {
  return {
    id: `gap_${category}`,
    category,
    severity: 'high',
    message: category,
    why_it_matters: '',
    suggested_fix: '',
    related_files: [],
  };
}

describe('defect metrics', () => {
  it('tracks discovery and fix rates from known defect categories', () => {
    const r = calculateDefectMetrics({
      knownDefects: [
        { id: 'no_tests', category: 'no_tests' },
        { defect_id: 'no_readme', category: 'missing_readme' },
        { id: 'unknown', category: 'not_detected' },
      ],
      findingsBefore: [finding('no_tests'), finding('missing_readme')],
      findingsAfter: [finding('missing_readme')],
    });

    expect(r.defects_known).toBe(3);
    expect(r.defects_detected).toBe(2);
    expect(r.defects_fixed).toBe(1);
    expect(r.defects_remaining).toBe(1);
    expect(r.discovery_rate).toBe(0.667);
    expect(r.fix_rate).toBe(0.5);
    expect(r.detected_ids).toContain('no_readme');
  });

  it('maps docs_lie defects to DocsTruth missing counts', () => {
    const r = calculateDefectMetrics({
      knownDefects: [{ id: 'readme_lies_test', category: 'docs_lie' }],
      findingsBefore: [],
      findingsAfter: [],
      docsBeforeMissing: 2,
      docsAfterMissing: 0,
    });

    expect(r.defects_detected).toBe(1);
    expect(r.defects_fixed).toBe(1);
    expect(r.fix_rate).toBe(1);
  });
});
