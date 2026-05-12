import path from 'node:path';
import { similarProjects } from '../../eval/projectSimilarity.js';
import { detectArchetype } from '../../core/projectArchetypeDetector.js';
import { selectStandardForProject } from '../../standards/adaptiveStandardManager.js';
import { requireProject } from './_shared.js';

export async function similar(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const systemRoot = path.resolve(new URL('../../..', import.meta.url).pathname);
  const hits = await similarProjects({ systemRoot, projectPath: project, topK: 5 });
  const arch = (await detectArchetype(project)).primary;
  const std = await selectStandardForProject(project);
  process.stdout.write(JSON.stringify({
    target_archetype: arch.id,
    recommended_project_standard: std.selected_name,
    similar_projects: hits,
  }, null, 2) + '\n');
  return 0;
}
