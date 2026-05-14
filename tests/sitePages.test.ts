import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCommand } from '../src/core/commandRunner.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

describe('MatrixOmnix site', () => {
  it('ships About, Service and Contact pages with upload contract checks', async () => {
    const result = await runCommand('node scripts/site-check.mjs', {
      cwd: root,
      timeoutMs: 20_000,
    });
    expect(result.passed).toBe(true);

    const service = await fs.readFile(path.join(root, 'site', 'service.html'), 'utf8');
    expect(service).toContain('data-return-format="zip"');
    expect(service).toContain('data-demo-upload');
    expect(service).toContain('.7z');
    expect(service).toContain('Output: zip');

    const about = await fs.readFile(path.join(root, 'site', 'about.html'), 'utf8');
    expect(about).toContain('https://github.com/Hosico02/demo2project');
    expect(about).toContain('multi-agent productization');

    const js = await fs.readFile(path.join(root, 'site', 'app.js'), 'utf8');
    expect(js).toContain('allowedArchives');
    expect(js).toContain('requestAnimationFrame');
    expect(js).toContain('touchstart');
  });
});
