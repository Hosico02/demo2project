import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runSetup } from '../../src/product/setup/SetupWizard.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('SetupWizard', () => {
  it('dry-run produces a plan without writing', async () => {
    const proj = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-'));
    await fs.writeFile(path.join(proj, 'package.json'), JSON.stringify({ name: 'x' }));
    const r = await runSetup({ systemRoot: root, projectPath: proj, profile: 'balanced', dryRun: true });
    expect(r.written_files).toEqual([]);
    expect(r.plan.config.profile).toBe('balanced');
    expect(r.next_steps.length).toBeGreaterThan(3);
  });

  it('apply writes a project config', async () => {
    const proj = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-'));
    await fs.writeFile(path.join(proj, 'package.json'), JSON.stringify({ name: 'x' }));
    const r = await runSetup({ systemRoot: root, projectPath: proj, profile: 'conservative' });
    expect(r.written_files.length).toBe(1);
    const cfg = JSON.parse(await fs.readFile(r.written_files[0]!, 'utf8'));
    expect(cfg.profile).toBe('conservative');
  });
});
