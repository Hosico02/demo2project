import { describe, it, expect } from 'vitest';
import { evaluateTransfer, applicableForArchetype } from '../src/qa/QATransferability.js';
import type { QACase } from '../src/core/types.js';
import type { ProjectArchetype } from '../src/core/projectArchetypeDetector.js';

function mkCase(over: Partial<QACase> = {}): QACase {
  return {
    id: 'qa_x',
    title: 't',
    category: 'misc',
    severity: 'medium',
    frequency: 1,
    status: 'active',
    project_type: ['generic'],
    bug_source: { iteration_id: 'i', agent: 'qa', source: 's', related_files: [] },
    trigger_condition: '', human_flow: [], expected_behavior: '', actual_failure: '',
    regression_assertions: [], reproduction_steps: [], suggested_test_type: 'unit',
    fingerprint: 'fp_x', created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z', last_seen_at: '2026-01-01T00:00:00.000Z',
    related_files: [],
    ...over,
  };
}

function arch(id: ProjectArchetype['id'], signals: string[] = []): ProjectArchetype {
  return {
    id, name: id, confidence: 0.9, detected_signals: signals, missing_signals: [],
    recommended_standard: id, applicable_qa_patterns: [], risk_profile: 'low',
  };
}

describe('QA transferability', () => {
  it('legacy generic case applies to any archetype', () => {
    const d = evaluateTransfer(mkCase({ project_type: ['generic'] }), arch('node-cli'));
    expect(d.applicable).toBe(true);
  });
  it('excluded_archetypes blocks the case', () => {
    const c = mkCase({ transferability: {
      scope: 'workspace', portability_score: 0.9,
      applicable_archetypes: [], excluded_archetypes: ['nextjs-app'],
      required_project_signals: [], excluded_project_signals: [],
      minimum_confidence: 'medium', examples_where_triggered: [], examples_where_prevented_failure: [], false_positive_contexts: [],
    } });
    expect(evaluateTransfer(c, arch('nextjs-app')).applicable).toBe(false);
    expect(evaluateTransfer(c, arch('react-app')).applicable).toBe(true);
  });
  it('required_project_signals must all match', () => {
    const c = mkCase({ transferability: {
      scope: 'workspace', portability_score: 0.5,
      applicable_archetypes: [], excluded_archetypes: [],
      required_project_signals: ['dep:react'], excluded_project_signals: [],
      minimum_confidence: 'medium', examples_where_triggered: [], examples_where_prevented_failure: [], false_positive_contexts: [],
    } });
    expect(evaluateTransfer(c, arch('react-app', ['dep:react'])).applicable).toBe(true);
    expect(evaluateTransfer(c, arch('node-cli', [])).applicable).toBe(false);
  });
  it('noisy + retired cases never apply', () => {
    expect(evaluateTransfer(mkCase({ lifecycle: 'noisy' }), arch('node-cli')).applicable).toBe(false);
    expect(evaluateTransfer(mkCase({ lifecycle: 'retired' }), arch('node-cli')).applicable).toBe(false);
  });
  it('applicableForArchetype sorts by rank', () => {
    const high = mkCase({ id: 'a', fingerprint: 'a', lifecycle: 'confirmed', usefulness_score: 10, transferability: {
      scope: 'workspace', portability_score: 0.9, applicable_archetypes: [], excluded_archetypes: [],
      required_project_signals: [], excluded_project_signals: [], minimum_confidence: 'medium',
      examples_where_triggered: [], examples_where_prevented_failure: [], false_positive_contexts: [],
    } });
    const low = mkCase({ id: 'b', fingerprint: 'b', transferability: {
      scope: 'workspace', portability_score: 0.1, applicable_archetypes: [], excluded_archetypes: [],
      required_project_signals: [], excluded_project_signals: [], minimum_confidence: 'low',
      examples_where_triggered: [], examples_where_prevented_failure: [], false_positive_contexts: [],
    } });
    const out = applicableForArchetype([low, high], arch('node-cli'));
    expect(out[0]!.id).toBe('a');
  });
});
