import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { check } from '../../src/product/compatibility/CompatibilityManager.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('CompatibilityManager', () => {
  it('returns tools array + node_runtime', async () => {
    const r = await check(root);
    expect(Array.isArray(r.tools)).toBe(true);
    expect(r.tools.some((t) => t.name === 'node')).toBe(true);
    expect(r.node_runtime).toBeTruthy();
  });
});
