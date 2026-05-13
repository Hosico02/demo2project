import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nextSteps, firstRunBanner } from '../../src/product/onboarding/OnboardingGuide.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('OnboardingGuide', () => {
  it('first-run banner is non-empty', async () => {
    expect((await firstRunBanner()).length).toBeGreaterThan(40);
  });
  it('next steps are structured with command/reason/risk', async () => {
    const s = await nextSteps(root);
    expect(s[0]!.command).toBeTruthy();
    expect(s[0]!.reason).toBeTruthy();
    expect(['low', 'medium', 'high']).toContain(s[0]!.risk);
  });
});
