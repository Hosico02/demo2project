import { describe, it, expect } from 'vitest';
import { diagnose } from '../../src/product/diagnostics/DiagnosticSystem.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('doctor command', () => {
  it('runs probes and returns a structured report', async () => {
    const r = await diagnose(root);
    expect(Array.isArray(r.probes)).toBe(true);
    expect(r.probes.length).toBeGreaterThan(5);
    expect(r.probes.some((p) => p.name === 'node')).toBe(true);
  });
});
