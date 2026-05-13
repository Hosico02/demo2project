import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAll, findById } from '../../src/product/recipes/Recipe.js';
import { planRun } from '../../src/product/recipes/RecipeRunner.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('Recipes', () => {
  it('loads at least 7 recipes', async () => {
    const r = await loadAll(root);
    expect(r.length).toBeGreaterThanOrEqual(7);
  });
  it('node-cli recipe exists and has steps', async () => {
    const r = await findById(root, 'node-cli-projectization');
    expect(r).not.toBeNull();
    expect(r!.steps.length).toBeGreaterThan(0);
  });
  it('planRun resolves commands and warns by default about execution', async () => {
    const r = await findById(root, 'node-cli-projectization');
    const plan = planRun(r!, '/tmp/x', { dryRun: false });
    expect(plan.resolved_commands.length).toBe(r!.steps.length);
    expect(plan.warnings.length).toBeGreaterThan(0);
  });
});
