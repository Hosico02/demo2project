import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Demo2ProjectClient } from '../../src/sdk/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('Demo2ProjectClient', () => {
  it('analyzes bad-demo', async () => {
    const c = new Demo2ProjectClient({ systemRoot: root, projectPath: path.join(root, 'examples', 'bad-demo') });
    const r = await c.analyze();
    expect(r.score).toBeGreaterThan(0);
    expect(typeof r.grade).toBe('string');
  });
  it('gap returns shape', async () => {
    const c = new Demo2ProjectClient({ systemRoot: root, projectPath: path.join(root, 'examples', 'bad-demo') });
    const r = await c.gap();
    expect(Array.isArray(r.findings)).toBe(true);
  });
  it('trust report works', async () => {
    const c = new Demo2ProjectClient({ systemRoot: root });
    const r = await c.security.trustReport();
    expect(typeof r.trust_score).toBe('number');
  });
});
