import { describe, it, expect } from 'vitest';
import { recordSignal, recomputeLifecycle, retire, promote, shouldAutoRetire } from '../src/qa/QACaseLifecycle.js';
import type { QACase } from '../src/core/types.js';

function mkCase(over: Partial<QACase> = {}): QACase {
  return {
    id: 'qa_1',
    title: 't',
    category: 'misc',
    severity: 'medium',
    frequency: 1,
    status: 'active',
    project_type: ['generic'],
    bug_source: { iteration_id: 'i', agent: 'qa', source: 's', related_files: [] },
    trigger_condition: '',
    human_flow: [],
    expected_behavior: '',
    actual_failure: '',
    regression_assertions: [],
    reproduction_steps: [],
    suggested_test_type: 'unit',
    fingerprint: 'fp',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    last_seen_at: '2026-01-01T00:00:00.000Z',
    related_files: [],
    ...over,
  };
}

describe('QA case lifecycle', () => {
  it('starts in "new" before any signals', () => {
    const c = recomputeLifecycle(mkCase());
    expect(c.lifecycle).toBe('new');
  });

  it('transitions new → active after preflight reference', () => {
    const c = recordSignal(mkCase(), { was_referenced_in_preflight: true });
    expect(c.lifecycle).toBe('active');
    expect(c.last_triggered_at).toBeTruthy();
  });

  it('transitions active → confirmed after 2 true positives', () => {
    let c = recordSignal(mkCase(), { produced_true_positive: true });
    c = recordSignal(c, { produced_true_positive: true });
    expect(c.lifecycle).toBe('confirmed');
    expect(c.usefulness_score).toBeGreaterThan(5);
  });

  it('transitions to noisy when FP > TP and total >= 3', () => {
    let c = recordSignal(mkCase(), { produced_false_positive: true });
    c = recordSignal(c, { produced_false_positive: true });
    c = recordSignal(c, { produced_true_positive: true });
    expect(c.lifecycle).toBe('noisy');
  });

  it('retire() persists retired_at + reason and archives', () => {
    const r = retire(mkCase(), 'manual');
    expect(r.lifecycle).toBe('retired');
    expect(r.retired_at).toBeTruthy();
    expect(r.status).toBe('archived');
  });

  it('promote() jumps to confirmed and bumps usefulness', () => {
    const p = promote(mkCase());
    expect(p.lifecycle).toBe('confirmed');
    expect(p.usefulness_score! >= 10).toBe(true);
  });

  it('shouldAutoRetire flags stale or noisy-with-many-FP cases', () => {
    const noisy = mkCase({ lifecycle: 'noisy', false_positive_count: 5, true_positive_count: 0 });
    expect(shouldAutoRetire(noisy).retire).toBe(true);
    const stale = mkCase({ last_triggered_at: '2010-01-01T00:00:00.000Z' });
    expect(shouldAutoRetire(stale, { maxAgeDays: 180 }).retire).toBe(true);
    const fresh = mkCase({ last_triggered_at: new Date().toISOString() });
    expect(shouldAutoRetire(fresh).retire).toBe(false);
  });
});
