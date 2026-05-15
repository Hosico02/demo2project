import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cli = path.join(root, 'dist', 'cli', 'index.js');

describe('CLI help output', () => {
  it('--help prints organised groups', () => {
    const r = spawnSync('node', [cli, '--help'], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Quickstart');
    expect(r.stdout).toContain('Core');
    expect(r.stdout).toContain('Security');
    expect(r.stdout).toContain('--advisory-agents');
  });
  it('unknown command yields exit code 2', () => {
    const r = spawnSync('node', [cli, 'this-does-not-exist'], { encoding: 'utf8' });
    expect(r.status).toBe(2);
  });
});
