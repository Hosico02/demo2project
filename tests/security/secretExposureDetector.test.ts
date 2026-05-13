import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { detectExposure } from '../../src/security/secrets/SecretExposureDetector.js';

describe('SecretExposureDetector', () => {
  it('detects secrets in persisted qa-cases.json', async () => {
    const d = await fs.mkdtemp(path.join(os.tmpdir(), 'sxd-'));
    await fs.mkdir(path.join(d, '.demo2project'), { recursive: true });
    await fs.writeFile(path.join(d, '.demo2project', 'qa-cases.json'), JSON.stringify([{ secret: 'AKIA' + 'ABCDEFGHIJKLMNOP' }]));
    const r = await detectExposure(d);
    expect(r.total_findings).toBeGreaterThan(0);
  });
  it('returns empty when no surfaces present', async () => {
    const d = await fs.mkdtemp(path.join(os.tmpdir(), 'sxd-'));
    const r = await detectExposure(d);
    expect(r.surfaces).toEqual([]);
  });
});
