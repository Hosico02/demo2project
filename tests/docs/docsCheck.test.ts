import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { check } from '../../src/product/docs/DocsChecker.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('DocsChecker', () => {
  it('all required docs present', async () => {
    const r = await check(root);
    expect(r.missing).toEqual([]);
    expect(r.ok).toBe(true);
  });
  it('README has Quickstart', async () => {
    const r = await check(root);
    expect(r.readme_has_quickstart).toBe(true);
  });
});
