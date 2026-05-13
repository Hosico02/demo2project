import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fileExists } from '../../src/utils/fs.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('SDK examples', () => {
  it('basic-analysis example exists', () => {
    expect(fileExists(path.join(root, 'examples', 'sdk', 'basic-analysis.ts'))).toBe(true);
  });
  it('qa-preflight example exists', () => {
    expect(fileExists(path.join(root, 'examples', 'sdk', 'qa-preflight.ts'))).toBe(true);
  });
  it('trust-report example exists', () => {
    expect(fileExists(path.join(root, 'examples', 'sdk', 'trust-report.ts'))).toBe(true);
  });
});
