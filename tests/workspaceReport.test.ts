import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import { workspaceReport } from '../src/cli/commands/workspaceReport.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

describe('workspace report', () => {
  it('produces expected markdown files', async () => {
    const code = await workspaceReport({});
    expect(code).toBe(0);
    const dir = path.join(repoRoot, 'reports', 'workspace');
    for (const f of ['generalization-report.md', 'qa-memory-report.md', 'standard-feedback-report.md', 'executor-comparison-report.md']) {
      const stat = await fs.stat(path.join(dir, f)).catch(() => null);
      expect(stat, `missing ${f}`).not.toBeNull();
    }
  });
});
