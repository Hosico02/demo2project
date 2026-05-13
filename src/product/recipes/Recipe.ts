import path from 'node:path';
import { promises as fs } from 'node:fs';
import { readJsonSafe } from '../../utils/json.js';
import { fileExists } from '../../utils/fs.js';

export interface RecipeStep {
  command: string;
  purpose: string;
}

export interface Recipe {
  id: string;
  name: string;
  archetype: string;
  description: string;
  recommended_standard: string;
  default_profile: 'conservative' | 'balanced' | 'autonomous';
  steps: RecipeStep[];
  qa_patterns: string[];
  verification_commands: string[];
  common_risks: string[];
  success_criteria: string[];
  docs?: string;
}

export async function loadAll(systemRoot: string): Promise<Recipe[]> {
  const dir = path.join(systemRoot, 'recipes');
  if (!fileExists(dir)) return [];
  let entries: string[] = [];
  try { entries = await fs.readdir(dir); } catch { return []; }
  const out: Recipe[] = [];
  for (const f of entries.filter((e) => e.endsWith('.json'))) {
    const r = await readJsonSafe<Recipe>(path.join(dir, f));
    if (r) out.push(r);
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export async function findById(systemRoot: string, id: string): Promise<Recipe | null> {
  const all = await loadAll(systemRoot);
  return all.find((r) => r.id === id) ?? null;
}
