import { describe, it, expect } from 'vitest';
import { clusterCases, findClosest } from '../src/qa/QASimilarity.js';
import type { QACase } from '../src/core/types.js';

function mkCase(overrides: Partial<QACase>): QACase {
  return {
    id: 'qa_' + Math.random().toString(36).slice(2, 8),
    title: 'untitled',
    category: 'misc',
    severity: 'medium',
    frequency: 1,
    status: 'active',
    project_type: ['generic'],
    bug_source: { iteration_id: 'iter', agent: 'qa', source: 'test', related_files: [] },
    trigger_condition: '',
    human_flow: [],
    expected_behavior: '',
    actual_failure: '',
    regression_assertions: [],
    reproduction_steps: [],
    suggested_test_type: 'unit',
    fingerprint: 'fp-' + Math.random().toString(36).slice(2, 6),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    related_files: [],
    ...overrides,
  };
}

describe('QASimilarity', () => {
  it('clusters similar cases together', () => {
    const a = mkCase({ title: 'executor changed files without verification', category: 'missing_validation', actual_failure: 'no commands run after change' });
    const b = mkCase({ title: 'task changed files but ran no verification commands', category: 'missing_validation', actual_failure: 'executor did not run verification' });
    const c = mkCase({ title: 'unsafe rm -rf command attempted', category: 'safety', actual_failure: 'dangerous command attempted' });
    const clusters = clusterCases([a, b, c]);
    expect(clusters.length).toBe(2);
    const big = clusters.find((cl) => cl.members.length === 2)!;
    expect(big.members).toContain(a.id);
    expect(big.members).toContain(b.id);
  });

  it('findClosest returns the nearest case above threshold', () => {
    const a = mkCase({
      title: 'sensitive token leaked into log output',
      actual_failure: 'token visible in log line written by executor',
      trigger_condition: 'log output contained sensitive token leak',
    });
    const b = mkCase({
      title: 'review_finding rule executor',
      actual_failure: 'unrelated review issue',
      trigger_condition: 'completely different content',
    });
    const candidate = mkCase({
      title: 'token leaked into log line by executor',
      actual_failure: 'sensitive token visible in log output again',
      trigger_condition: 'log contained sensitive token leak',
    });
    const hit = findClosest(candidate, [a, b], { threshold: 0.3 });
    expect(hit).not.toBeNull();
    expect(hit!.case.id).toBe(a.id);
  });
});
