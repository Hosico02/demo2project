import { describe, it, expect } from 'vitest';
import { selfIterateSandbox } from '../src/cli/commands/selfIterateSandbox.js';

describe('self-iterate-sandbox', () => {
  it('read-only mode prints a plan and exits 0', async () => {
    const original = process.stdout.write.bind(process.stdout);
    let captured = '';
    process.stdout.write = ((chunk: any) => { captured += chunk; return true; }) as any;
    const code = await selfIterateSandbox({});
    process.stdout.write = original;
    expect(code).toBe(0);
    expect(captured).toMatch(/read-only/);
    expect(captured).toMatch(/score_before/);
  });
});
