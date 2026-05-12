import { describe, it, expect } from 'vitest';
import { isForbiddenSelfMod, requiresApproval, DEFAULT_AUTONOMY_POLICY } from '../src/core/autonomyPolicy.js';

describe('Self-improvement safety rules', () => {
  it('refuses to mutate src/core/safety.ts', () => {
    expect(isForbiddenSelfMod(DEFAULT_AUTONOMY_POLICY, 'src/core/safety.ts')).toBe(true);
  });
  it('refuses to mutate src/core/redaction.ts', () => {
    expect(isForbiddenSelfMod(DEFAULT_AUTONOMY_POLICY, 'src/core/redaction.ts')).toBe(true);
  });
  it('refuses to mutate config/autonomy-policy.json', () => {
    expect(isForbiddenSelfMod(DEFAULT_AUTONOMY_POLICY, 'config/autonomy-policy.json')).toBe(true);
  });
  it('refuses to mutate config/approval-policy.json', () => {
    expect(isForbiddenSelfMod(DEFAULT_AUTONOMY_POLICY, 'config/approval-policy.json')).toBe(true);
  });
  it('refuses to mutate templates/claude/hooks/', () => {
    expect(isForbiddenSelfMod(DEFAULT_AUTONOMY_POLICY, 'templates/claude/hooks/pre-tool-use-safety.mjs')).toBe(true);
  });
  it('allows README.md', () => {
    expect(isForbiddenSelfMod(DEFAULT_AUTONOMY_POLICY, 'README.md')).toBe(false);
  });
  it('package-lock.json requires approval', () => {
    expect(requiresApproval(DEFAULT_AUTONOMY_POLICY, 'pnpm-lock.yaml')).toBe(true);
  });
});
