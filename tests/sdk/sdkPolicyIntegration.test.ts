import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Demo2ProjectClient } from '../../src/sdk/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('SDK ↔ policy integration', () => {
  it('policyCheck returns a decision', async () => {
    const c = new Demo2ProjectClient({ systemRoot: root });
    const r = await c.security.policyCheck({ action: 'command_execution', command: 'rm -rf /' });
    expect(r.decision.decision).toBe('deny');
  });
  it('policyCheck allows safe command', async () => {
    const c = new Demo2ProjectClient({ systemRoot: root });
    const r = await c.security.policyCheck({ action: 'command_execution', command: 'pnpm test' });
    expect(r.decision.decision).toBe('allow_with_constraints');
  });
});
