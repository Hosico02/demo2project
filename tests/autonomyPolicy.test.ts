import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  loadPolicy, savePolicy, setAutonomyLevel, explain,
  isForbiddenSelfMod, requiresApproval, DEFAULT_AUTONOMY_POLICY, AUTONOMY_LEVELS,
} from '../src/core/autonomyPolicy.js';

async function tmpRoot(): Promise<string> {
  return fs.mkdtemp(path.join(tmpdir(), 'd2p-ap-'));
}

describe('AutonomyPolicy', () => {
  it('has 6 levels', () => {
    expect(AUTONOMY_LEVELS.length).toBe(6);
    expect(AUTONOMY_LEVELS).toContain('L0_READ_ONLY');
    expect(AUTONOMY_LEVELS).toContain('L5_RESTRICTED_AUTONOMOUS_LOOP');
  });
  it('loads default policy when file missing', async () => {
    const root = await tmpRoot();
    const p = await loadPolicy(root);
    expect(p.default_autonomy_level).toBe(DEFAULT_AUTONOMY_POLICY.default_autonomy_level);
  });
  it('persists and reloads policy', async () => {
    const root = await tmpRoot();
    await savePolicy(root, { ...DEFAULT_AUTONOMY_POLICY, max_iterations: 7 });
    const p = await loadPolicy(root);
    expect(p.max_iterations).toBe(7);
  });
  it('setAutonomyLevel updates default_autonomy_level', async () => {
    const root = await tmpRoot();
    const p = await setAutonomyLevel(root, 'L1_ANALYZE_AND_REPORT');
    expect(p.default_autonomy_level).toBe('L1_ANALYZE_AND_REPORT');
  });
  it('isForbiddenSelfMod recognizes safety.ts and qa/specs', () => {
    expect(isForbiddenSelfMod(DEFAULT_AUTONOMY_POLICY, 'src/core/safety.ts')).toBe(true);
    expect(isForbiddenSelfMod(DEFAULT_AUTONOMY_POLICY, 'qa/specs/x.json')).toBe(true);
    expect(isForbiddenSelfMod(DEFAULT_AUTONOMY_POLICY, 'README.md')).toBe(false);
  });
  it('requiresApproval covers locked paths', () => {
    expect(requiresApproval(DEFAULT_AUTONOMY_POLICY, 'src/core/safety.ts')).toBe(true);
    expect(requiresApproval(DEFAULT_AUTONOMY_POLICY, 'README.md')).toBe(false);
  });
  it('explain returns permissions/prohibitions for the chosen level', async () => {
    const root = await tmpRoot();
    const e = await explain(root, 'L4_SELF_ITERATION_SANDBOX');
    expect(e.level).toBe('L4_SELF_ITERATION_SANDBOX');
    expect(e.permissions.length).toBeGreaterThan(0);
    expect(e.prohibitions.length).toBeGreaterThan(0);
  });
});
