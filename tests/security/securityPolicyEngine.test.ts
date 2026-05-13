import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSecurityPolicy, check, validate } from '../../src/security/policy/SecurityPolicyEngine.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('SecurityPolicyEngine', () => {
  it('loads default policy and validates it', async () => {
    const p = await loadSecurityPolicy(root);
    expect(p.rules.length).toBeGreaterThan(20);
    const v = validate(p);
    expect(v.ok).toBe(true);
  });

  it('denies rm -rf / via command_execution rule', async () => {
    const r = await check(root, { action: 'command_execution', actor: 'test', command: 'rm -rf /' });
    expect(r.decision.decision).toBe('deny');
    expect(r.violation).not.toBeNull();
  });

  it('requires approval for write to safety.ts', async () => {
    const r = await check(root, { action: 'file_write', actor: 'test', target_path: 'src/core/safety.ts' });
    expect(r.decision.decision).toBe('require_approval');
  });

  it('allows normal write inside project', async () => {
    const r = await check(root, { action: 'file_write', actor: 'test', target_path: 'src/components/Foo.ts' });
    expect(r.decision.decision).toBe('allow');
  });

  it('denies verification gate update', async () => {
    const r = await check(root, { action: 'verification_gate_update', actor: 'test' });
    expect(r.decision.decision).toBe('deny');
  });
});
