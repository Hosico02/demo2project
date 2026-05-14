import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { listFiles } from '../src/utils/fs.js';

describe('listFiles', () => {
  it('skips .git internals but keeps .gitignore and .github workflows', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-list-files-'));
    await fs.mkdir(path.join(dir, '.git', 'objects'), { recursive: true });
    await fs.mkdir(path.join(dir, '.github', 'workflows'), { recursive: true });
    await fs.mkdir(path.join(dir, '.zp', 'bin'), { recursive: true });
    await fs.mkdir(path.join(dir, '.pycache'), { recursive: true });
    await fs.writeFile(path.join(dir, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    await fs.writeFile(path.join(dir, '.gitignore'), 'node_modules/\n');
    await fs.writeFile(path.join(dir, '.github', 'workflows', 'ci.yml'), 'name: CI\n');
    await fs.writeFile(path.join(dir, '.zp', 'bin', 'tool.py'), 'print("tool")\n');
    await fs.writeFile(path.join(dir, '.pycache', 'x.pyc'), 'cache\n');

    const files = await listFiles(dir);

    expect(files).toContain('.gitignore');
    expect(files).toContain(path.join('.github', 'workflows', 'ci.yml'));
    expect(files.some((f) => f.startsWith('.git/'))).toBe(false);
    expect(files.some((f) => f.startsWith('.zp/'))).toBe(false);
    expect(files.some((f) => f.startsWith('.pycache/'))).toBe(false);
  });
});
