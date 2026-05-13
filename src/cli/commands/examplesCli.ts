import { list, runExample, reportExample } from '../../product/examples/ExamplesManager.js';
import { defaultSystemRoot, flagString } from './_shared.js';

export async function examplesList(_flags: Record<string, string | boolean>): Promise<number> {
  const r = await list(defaultSystemRoot());
  process.stdout.write(JSON.stringify({ total: r.length, examples: r }, null, 2) + '\n');
  return 0;
}

export async function examplesRun(flags: Record<string, string | boolean>): Promise<number> {
  const id = flagString(flags, 'id');
  if (!id) { process.stderr.write('--id required\n'); return 2; }
  try {
    const r = await runExample(defaultSystemRoot(), id);
    process.stdout.write(JSON.stringify(r, null, 2) + '\n');
    return 0;
  } catch (e) { process.stderr.write(`error: ${(e as Error).message}\n`); return 1; }
}

export async function examplesReport(flags: Record<string, string | boolean>): Promise<number> {
  const id = flagString(flags, 'id');
  if (!id) { process.stderr.write('--id required\n'); return 2; }
  try {
    const r = await reportExample(defaultSystemRoot(), id);
    process.stdout.write(JSON.stringify(r, null, 2) + '\n');
    return 0;
  } catch (e) { process.stderr.write(`error: ${(e as Error).message}\n`); return 1; }
}

export async function docsListCmd(_flags: Record<string, string | boolean>): Promise<number> {
  return examplesList({});
}
