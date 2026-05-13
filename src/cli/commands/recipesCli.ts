import { loadAll, findById } from '../../product/recipes/Recipe.js';
import { recommend } from '../../product/recipes/RecipeRecommender.js';
import { planRun } from '../../product/recipes/RecipeRunner.js';
import { defaultSystemRoot, flagString, requireProject } from './_shared.js';

export async function recipesList(_flags: Record<string, string | boolean>): Promise<number> {
  const r = await loadAll(defaultSystemRoot());
  process.stdout.write(JSON.stringify({ total: r.length, recipes: r.map((x) => ({ id: x.id, name: x.name, archetype: x.archetype })) }, null, 2) + '\n');
  return 0;
}

export async function recipesShow(flags: Record<string, string | boolean>): Promise<number> {
  const id = flagString(flags, 'id');
  if (!id) { process.stderr.write('--id required\n'); return 2; }
  const r = await findById(defaultSystemRoot(), id);
  if (!r) { process.stderr.write(`recipe ${id} not found\n`); return 1; }
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function recipesRecommend(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = requireProject(flags);
  if (!projectPath) return 2;
  const r = await recommend(defaultSystemRoot(), projectPath);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function recipesRun(flags: Record<string, string | boolean>): Promise<number> {
  const id = flagString(flags, 'id');
  const projectPath = requireProject(flags);
  if (!id || !projectPath) { if (!id) process.stderr.write('--id required\n'); return 2; }
  const r = await findById(defaultSystemRoot(), id);
  if (!r) { process.stderr.write(`recipe ${id} not found\n`); return 1; }
  const dryRun = flags['dry-run'] !== false;
  const plan = planRun(r, projectPath, { dryRun });
  process.stdout.write(JSON.stringify(plan, null, 2) + '\n');
  return 0;
}
