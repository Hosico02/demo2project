import { detectArchetype } from '../../core/projectArchetypeDetector.js';
import { loadAll } from './Recipe.js';
import type { Recipe } from './Recipe.js';

export interface RecommendResult {
  archetype: string;
  recommended_recipe: Recipe | null;
  alternatives: Recipe[];
  reason: string;
}

export async function recommend(systemRoot: string, projectPath: string): Promise<RecommendResult> {
  const arch = await detectArchetype(projectPath);
  const all = await loadAll(systemRoot);
  const direct = all.find((r) => r.archetype === arch.primary.id);
  const alternatives = all.filter((r) => r !== direct);
  return {
    archetype: arch.primary.id,
    recommended_recipe: direct ?? null,
    alternatives,
    reason: direct ? `archetype match (${arch.primary.id})` : 'no exact recipe match',
  };
}
