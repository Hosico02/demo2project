import type { Recipe } from './Recipe.js';

export interface RunPlan {
  recipe: Recipe;
  resolved_commands: string[];
  warnings: string[];
  risks: string[];
  next_steps: string[];
}

export function planRun(recipe: Recipe, projectPath: string, opts: { dryRun?: boolean } = {}): RunPlan {
  const resolved = recipe.steps.map((s) => `pnpm demo2project ${s.command.includes('--project') ? s.command : `${s.command} --project ${projectPath}`}`);
  const warnings: string[] = [];
  if (!opts.dryRun) warnings.push('recipe execution will run commands — review with --dry-run first');
  return {
    recipe,
    resolved_commands: resolved,
    warnings,
    risks: recipe.common_risks,
    next_steps: ['Inspect output of each step', 'Run qa:regression after iterate', 'Run report:project to produce a shareable summary'],
  };
}
