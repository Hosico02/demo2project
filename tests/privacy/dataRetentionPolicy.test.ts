import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { loadPolicy, savePolicy } from '../../src/privacy/DataRetentionPolicy.js';

describe('DataRetentionPolicy', () => {
  it('loads default and saves modified', async () => {
    const d = await fs.mkdtemp(path.join(os.tmpdir(), 'drp-'));
    const p = await loadPolicy(d);
    expect(p.keep_audit_log_days).toBeGreaterThan(0);
    p.keep_audit_log_days = 7;
    await savePolicy(d, p);
    const back = await loadPolicy(d);
    expect(back.keep_audit_log_days).toBe(7);
  });
});
