import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { check } from '../../src/product/release/ReleaseCheck.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('Release check', () => {
  it('runs and reports checks', async () => {
    const r = await check(root);
    expect(r.checks.length).toBeGreaterThan(5);
    expect(r.checks.some((c) => c.name === 'package.json present')).toBe(true);
  });
});
