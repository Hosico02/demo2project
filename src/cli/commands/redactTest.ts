import path from 'node:path';
import { promises as fs } from 'node:fs';
import { redact, summarizeOutput } from '../../core/redaction.js';
import { flagString } from './_shared.js';

export async function redactTest(flags: Record<string, string | boolean>): Promise<number> {
  const input = flagString(flags, 'input');
  const sample = flagString(flags, 'sample');
  let text: string;
  if (sample) {
    text = sample;
  } else if (input) {
    text = await fs.readFile(path.resolve(input), 'utf8');
  } else {
    process.stderr.write('error: pass --input <file> or --sample "<text>"\n');
    return 2;
  }
  const redacted = redact(text);
  const summary = summarizeOutput(text, 40, 4000);
  process.stdout.write(JSON.stringify({
    input_length: text.length,
    redacted_length: redacted.length,
    redacted_preview: redacted.slice(0, 800),
    summary,
  }, null, 2) + '\n');
  return 0;
}
