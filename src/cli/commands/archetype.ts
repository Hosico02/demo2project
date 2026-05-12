import { detectArchetype } from '../../core/projectArchetypeDetector.js';
import { requireProject } from './_shared.js';

export async function archetype(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const r = await detectArchetype(project);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  process.stdout.write(`\n>> primary: ${r.primary.id} (confidence ${(r.primary.confidence * 100).toFixed(0)}%)\n`);
  if (r.alternatives.length > 0) {
    process.stdout.write(`   alternatives: ${r.alternatives.map((a) => `${a.id} (${(a.confidence * 100).toFixed(0)}%)`).join(', ')}\n`);
  }
  return 0;
}
