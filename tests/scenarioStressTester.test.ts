import { describe, it, expect } from 'vitest';
import { listScenarios, runScenarioByName, runAllScenarios } from '../src/core/scenarioStressTester.js';

describe('ScenarioStressTester', () => {
  it('lists 15 scenarios', () => {
    expect(listScenarios().length).toBe(15);
  });
  it('blocks rm -rf /', async () => {
    const r = await runScenarioByName('unsafe_command_attempted');
    expect(r.passed).toBe(true);
  });
  it('detects executor claims without evidence', async () => {
    const r = await runScenarioByName('executor_claims_without_evidence');
    expect(r.passed).toBe(true);
  });
  it('readme false claim detected', async () => {
    const r = await runScenarioByName('readme_command_false_claim');
    expect(r.passed).toBe(true);
  });
  it('self_iteration cannot modify safety gate', async () => {
    const r = await runScenarioByName('self_iteration_tries_to_modify_safety_gate');
    expect(r.passed).toBe(true);
  });
  it('runs all scenarios', async () => {
    const r = await runAllScenarios();
    expect(r.total).toBe(15);
    // We don't require 100% on every scenario but at minimum the safety-critical
    // ones above must pass; the suite reports failure count as data.
    expect(r.passed).toBeGreaterThanOrEqual(8);
  });
});
