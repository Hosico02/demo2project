import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recommend } from '../../src/product/recipes/RecipeRecommender.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('Recipe recommendation', () => {
  it('returns archetype + recommendation', async () => {
    const r = await recommend(root, path.join(root, 'examples', 'bad-demo'));
    expect(r.archetype).toBeTruthy();
  });
});
