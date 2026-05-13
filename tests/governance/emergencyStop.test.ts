import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { stop, resume, status } from '../../src/governance/incidents/EmergencyStop.js';

describe('EmergencyStop', () => {
  it('records active stop and resumes', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'es-'));
    let s = await status(root);
    expect(s.active).toBe(false);
    await stop(root, 'tester', 'just in case');
    s = await status(root);
    expect(s.active).toBe(true);
    expect(s.reason).toMatch(/just in case/);
    const r = await resume(root, 'tester', 'all clear');
    expect(r.active).toBe(false);
  });
});
