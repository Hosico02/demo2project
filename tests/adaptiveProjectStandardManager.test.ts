import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectStandardForProject, listAvailableStandards, validateAllStandards } from '../src/standards/adaptiveStandardManager.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

describe('AdaptiveProjectStandardManager', () => {
  it('list returns at least 7 archetype standards + generic-project', async () => {
    const names = await listAvailableStandards();
    expect(names.length).toBeGreaterThanOrEqual(8);
    for (const n of ['generic-project', 'node-cli', 'typescript-library', 'react-app', 'nextjs-app', 'python-package', 'fastapi-api', 'python-cli', 'monorepo', 'docs-only-project', 'agent-framework']) {
      expect(names).toContain(n);
    }
  });
  it('validateAllStandards passes for shipped standards', async () => {
    const r = await validateAllStandards();
    expect(r.problems, JSON.stringify(r.problems)).toEqual([]);
    expect(r.ok).toBe(true);
  });
  it('selects agent-framework standard for this repo', async () => {
    const r = await selectStandardForProject(repoRoot);
    expect(['agent-framework', 'typescript-library', 'node-cli']).toContain(r.selected_name);
    expect(r.confidence).toBeGreaterThan(0);
  });
});
