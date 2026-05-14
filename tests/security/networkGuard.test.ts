import { describe, it, expect } from 'vitest';
import { evaluateResearchUrl, evaluateUrl, recordIntent } from '../../src/security/guards/NetworkGuard.js';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';

describe('NetworkGuard', () => {
  it('allows npm registry by default', () => {
    expect(evaluateUrl('https://registry.npmjs.org/foo').allowed).toBe(true);
  });
  it('denies unknown URL', () => {
    expect(evaluateUrl('https://evil.example.com/').allowed).toBe(false);
  });
  it('untrusted repo denies even allowlist', () => {
    expect(evaluateUrl('https://registry.npmjs.org/foo', true).allowed).toBe(false);
  });
  it('records network intent to disk', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'net-'));
    await recordIntent(root, { actor: 'test', url: 'https://x', method: 'GET', intent: 'fetch', allowed: false, reason: 'denied' });
    const file = path.join(root, '.demo2project', 'network', 'intents.jsonl');
    const txt = await fs.readFile(file, 'utf8');
    expect(txt).toContain('GET');
  });
  it('keeps research search URLs denied until research networking is explicitly enabled', () => {
    expect(evaluateUrl('https://duckduckgo.com/html/?q=ui').allowed).toBe(false);
    expect(evaluateResearchUrl('https://duckduckgo.com/html/?q=ui').allowed).toBe(false);
    expect(evaluateResearchUrl('https://duckduckgo.com/html/?q=ui', { enabled: true }).allowed).toBe(true);
  });
});
