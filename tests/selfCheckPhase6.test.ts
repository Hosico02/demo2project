import { describe, it, expect } from 'vitest';
import { selfCheck } from '../src/cli/commands/selfCheck.js';

describe('self-check Phase 6 probes', () => {
  it('runs without error and exits 0 on this repo', async () => {
    const original = process.stdout.write.bind(process.stdout);
    let captured = '';
    process.stdout.write = ((chunk: any) => { captured += chunk; return true; }) as any;
    const code = await selfCheck({});
    process.stdout.write = original;
    expect(code).toBe(0);
    expect(captured).toMatch(/phase6_probes/);
    expect(captured).toMatch(/autonomy_policy_present/);
    expect(captured).toMatch(/safety_in_forbidden_list/);
  });
});
