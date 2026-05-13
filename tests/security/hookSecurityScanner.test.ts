import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scan } from '../../src/security/plugins/HookSecurityScanner.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('HookSecurityScanner', () => {
  it('scans bundled hooks and finds at least the demo2project security set', async () => {
    const r = await scan(root);
    expect(r.hooks_found).toBeGreaterThan(0);
    // The post-tool-use-audit-recorder writes to disk (fs ops); should appear with reasons.
    const audit = r.findings.find((f) => f.file.includes('post-tool-use-audit-recorder'));
    expect(audit).toBeDefined();
  });
});
