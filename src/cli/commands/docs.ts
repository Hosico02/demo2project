import { check } from '../../product/docs/DocsChecker.js';
import { defaultSystemRoot } from './_shared.js';

export async function docsCheck(_flags: Record<string, string | boolean>): Promise<number> {
  const r = await check(defaultSystemRoot());
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return r.ok ? 0 : 1;
}
