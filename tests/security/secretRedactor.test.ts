import { describe, it, expect } from 'vitest';
import { redactString, redactObject } from '../../src/security/secrets/SecretRedactor.js';

describe('SecretRedactor', () => {
  it('redacts strings', () => {
    const out = redactString('AKIA' + 'ABCDEFGHIJKLMNOP');
    expect(out).toContain('***REDACTED');
  });
  it('redacts objects deeply', () => {
    const o = { nested: { token: 'ghp_' + 'X'.repeat(40) } };
    const r = redactObject(o);
    expect(JSON.stringify(r)).toContain('REDACTED');
  });
});
