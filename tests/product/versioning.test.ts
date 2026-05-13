import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('Versioning', () => {
  it('package.json has version', async () => {
    const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
  });
  it('CHANGELOG.md present and mentions 0.0.8', async () => {
    const txt = await fs.readFile(path.join(root, 'CHANGELOG.md'), 'utf8');
    expect(txt).toContain('0.0.8');
  });
});
