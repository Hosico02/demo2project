import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { workspaceReport } from '../src/cli/commands/workspaceReport.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

describe('workspace report', () => {
  it('produces expected markdown files', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-workspace-report-'));
    const code = await workspaceReport({ 'output-dir': dir });
    expect(code).toBe(0);
    for (const f of ['generalization-report.md', 'qa-memory-report.md', 'standard-feedback-report.md', 'executor-comparison-report.md']) {
      const stat = await fs.stat(path.join(dir, f)).catch(() => null);
      expect(stat, `missing ${f}`).not.toBeNull();
    }
  });
});
