import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('CLI information architecture', () => {
  it('HELP text mentions all command groups', async () => {
    const indexTs = await fs.readFile(path.join(root, 'src', 'cli', 'index.ts'), 'utf8');
    expect(indexTs).toContain('Quickstart');
    expect(indexTs).toContain('Core');
    expect(indexTs).toContain('Research');
    expect(indexTs).toContain('Iteration');
    expect(indexTs).toContain('Reports');
    expect(indexTs).toContain('Security');
    expect(indexTs).toContain('Product');
  });
  it('every Phase 8 command is wired in the switch', async () => {
    const indexTs = await fs.readFile(path.join(root, 'src', 'cli', 'index.ts'), 'utf8');
    for (const c of ['doctor', 'next', 'quickstart', 'research', 'config:show', 'config:validate', 'config:migrate', 'diagnose', 'report:project', 'report:html', 'claude:setup', 'github:install-workflows', 'extensions:list', 'recipes:list', 'compatibility', 'release:check', 'docs:check', 'product:score', 'ux:check', 'examples:list']) {
      expect(indexTs).toContain(`case '${c}':`);
    }
  });
});
