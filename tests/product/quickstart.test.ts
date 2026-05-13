import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runQuickstart } from '../../src/product/onboarding/Quickstart.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('Quickstart', () => {
  it('runs against bad-demo example', async () => {
    const r = await runQuickstart({ systemRoot: root, useExample: true });
    expect(r.steps.length).toBeGreaterThan(3);
    expect(typeof r.score).toBe('number');
    expect(r.next_steps.length).toBeGreaterThan(0);
    expect(r.what_demo2project_found).toBeTruthy();
  });
});
