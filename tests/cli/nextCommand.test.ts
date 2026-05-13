import { describe, it, expect } from 'vitest';
import { nextSteps, firstRunBanner } from '../../src/product/onboarding/OnboardingGuide.js';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('next command', () => {
  it('suggests at least 3 steps when no project given', async () => {
    const steps = await nextSteps(root);
    expect(steps.length).toBeGreaterThanOrEqual(3);
  });
  it('first-run banner mentions doctor / init / quickstart', async () => {
    const b = await firstRunBanner();
    expect(b).toMatch(/doctor/);
    expect(b).toMatch(/init/);
    expect(b).toMatch(/quickstart/);
  });
  it('with a project path, suggests trust:check + analyze first', async () => {
    const p = await fs.mkdtemp(path.join(os.tmpdir(), 'next-'));
    const steps = await nextSteps(root, p);
    expect(steps.some((s) => s.command.includes('trust:check'))).toBe(true);
    expect(steps.some((s) => s.command.includes('analyze'))).toBe(true);
  });
});
