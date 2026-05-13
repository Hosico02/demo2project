import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { list, runExample } from '../../src/product/examples/ExamplesManager.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('Examples manager', () => {
  it('lists at least one example', async () => {
    const r = await list(root);
    expect(r.length).toBeGreaterThan(0);
  });
  it('runs an example and returns a score', async () => {
    const all = await list(root);
    const r = await runExample(root, all[0]!.id);
    expect(typeof r.score).toBe('number');
  });
});
