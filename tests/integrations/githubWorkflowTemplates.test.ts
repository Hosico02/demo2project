import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { install, statusOf, WORKFLOWS, explain } from '../../src/integrations/github/WorkflowInstaller.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('GitHub workflow templates', () => {
  it('5 templates listed', () => {
    expect(WORKFLOWS.length).toBe(5);
  });
  it('explain returns descriptions', () => {
    const r = explain();
    expect(r.every((x) => x.description)).toBe(true);
  });
  it('install writes all 5 to .github/workflows', async () => {
    const proj = await fs.mkdtemp(path.join(os.tmpdir(), 'gh-'));
    const r = await install(root, proj);
    expect(r.installed.length).toBe(5);
    const st = await statusOf(proj);
    expect(st.installed.length).toBe(5);
  });
  it('dry-run does not write', async () => {
    const proj = await fs.mkdtemp(path.join(os.tmpdir(), 'gh-'));
    const r = await install(root, proj, { dryRun: true });
    expect(r.dry_run).toBe(true);
    const st = await statusOf(proj);
    expect(st.installed.length).toBe(0);
  });
});
