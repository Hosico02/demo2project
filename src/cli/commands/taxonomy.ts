import { listAll, explain, FAILURE_CATEGORIES, type FailureCategory } from '../../core/failureTaxonomy.js';
import { flagString } from './_shared.js';

export async function taxonomyList(_flags: Record<string, string | boolean>): Promise<number> {
  const grouped: Record<string, string[]> = {};
  for (const c of FAILURE_CATEGORIES) {
    const [bucket, leaf] = c.split('/') as [string, string];
    if (!grouped[bucket]) grouped[bucket] = [];
    grouped[bucket]!.push(leaf);
  }
  process.stdout.write(JSON.stringify({ total: FAILURE_CATEGORIES.length, grouped }, null, 2) + '\n');
  return 0;
}

export async function taxonomyExplain(flags: Record<string, string | boolean>): Promise<number> {
  const cat = flagString(flags, 'category');
  if (!cat) {
    process.stderr.write('error: --category <id> required\n');
    return 2;
  }
  if (!FAILURE_CATEGORIES.includes(cat as FailureCategory)) {
    process.stderr.write(`error: unknown category "${cat}"\n`);
    return 1;
  }
  process.stdout.write(JSON.stringify({
    category: cat,
    description: explain(cat as FailureCategory),
  }, null, 2) + '\n');
  return 0;
}
