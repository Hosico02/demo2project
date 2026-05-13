import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { diagnose } from '../../src/product/diagnostics/DiagnosticSystem.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('DiagnosticSystem', () => {
  it('returns probes and a summary', async () => {
    const r = await diagnose(root);
    expect(r.probes.length).toBeGreaterThan(5);
    expect(typeof r.summary).toBe('string');
  });
});
