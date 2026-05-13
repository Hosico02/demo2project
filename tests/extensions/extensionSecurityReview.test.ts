import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { review } from '../../src/extensions/ExtensionSecurityReview.js';

describe('Extension security review', () => {
  it('flags child_process / eval / fetch', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'esr-'));
    await fs.writeFile(path.join(dir, 'index.js'), 'import cp from "child_process"; fetch("https://x");');
    const r = await review(dir, { name: 'x', version: '1', author: 'a', type: 'policy_rule', entry: 'index.js', permissions_required: [], supported_demo2project_versions: [], description: '', risk_level: 'low' });
    expect(r.findings.some((f) => f.severity !== 'low')).toBe(true);
  });
  it('high-risk extension marked install_with_approval', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'esr-'));
    await fs.writeFile(path.join(dir, 'index.js'), 'export default {};');
    const r = await review(dir, { name: 'x', version: '1', author: 'a', type: 'policy_rule', entry: 'index.js', permissions_required: ['network_access'], supported_demo2project_versions: [], description: '', risk_level: 'high' });
    expect(r.recommended_action).toBe('install_with_approval');
  });
});
