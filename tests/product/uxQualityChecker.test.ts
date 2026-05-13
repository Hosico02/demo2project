import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { check } from '../../src/product/ux/UXQualityChecker.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('UXQualityChecker', () => {
  it('passes for the current repo', async () => {
    const r = await check(root);
    expect(r.ok).toBe(true);
  });
});
