import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOKS = [
  'pre-tool-use-security-policy.mjs',
  'pre-tool-use-command-guard.mjs',
  'pre-tool-use-file-access-guard.mjs',
  'pre-tool-use-secret-protection.mjs',
  'post-tool-use-audit-recorder.mjs',
  'post-tool-use-evidence-recorder.mjs',
  'stop-verification-and-policy-gate.mjs',
  'stop-incident-check.mjs',
];

describe('Claude security hook templates', () => {
  it('all 8 hooks are present', async () => {
    for (const h of HOOKS) {
      const p = path.join(root, 'templates', 'claude', 'hooks', h);
      const s = await fs.stat(p);
      expect(s.isFile()).toBe(true);
    }
  });
  it('hooks have shebang', async () => {
    for (const h of HOOKS) {
      const p = path.join(root, 'templates', 'claude', 'hooks', h);
      const txt = await fs.readFile(p, 'utf8');
      expect(txt.startsWith('#!/usr/bin/env node')).toBe(true);
    }
  });
});
