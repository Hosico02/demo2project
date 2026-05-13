import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { score } from '../../src/product/release/ProductReadinessScorer.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('ProductReadinessScorer', () => {
  it('scores 8 dimensions', async () => {
    const r = await score(root);
    expect(r.dimensions.length).toBe(8);
    expect(typeof r.total_score).toBe('number');
    expect(['demo', 'usable', 'shipping', 'mature']).toContain(r.grade);
  });
});
