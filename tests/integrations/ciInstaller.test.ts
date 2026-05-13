import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('CI installer', () => {
  it('workflows have safe permissions: contents: read', async () => {
    const dir = path.join(root, 'templates', 'github', 'workflows');
    const files = await fs.readdir(dir);
    for (const f of files.filter((x) => x.endsWith('.yml'))) {
      const txt = await fs.readFile(path.join(dir, f), 'utf8');
      expect(txt).toContain('permissions:');
      expect(txt).toContain('contents: read');
    }
  });
  it('preflight skips fork PRs', async () => {
    const txt = await fs.readFile(path.join(root, 'templates', 'github', 'workflows', 'demo2project-preflight.yml'), 'utf8');
    expect(txt).toContain('github.event.pull_request.head.repo.full_name == github.repository');
  });
});
