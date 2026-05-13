import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { loadMode, setMode } from '../../src/privacy/PrivacyMode.js';

describe('PrivacyMode', () => {
  it('default is normal', async () => {
    const d = await fs.mkdtemp(path.join(os.tmpdir(), 'pm-'));
    const m = await loadMode(d);
    expect(m.mode).toBe('normal');
  });
  it('switches mode', async () => {
    const d = await fs.mkdtemp(path.join(os.tmpdir(), 'pm-'));
    await setMode(d, 'strict_private');
    const m = await loadMode(d);
    expect(m.mode).toBe('strict_private');
    expect(m.record_source_snippets).toBe(false);
  });
});
