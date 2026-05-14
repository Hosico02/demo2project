import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCommand } from '../src/core/commandRunner.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

describe('MatrixOmnix site', () => {
  it('ships a Vite/Vue app with About, Service and Contact routes plus upload contract checks', async () => {
    const result = await runCommand('node scripts/site-check.mjs', {
      cwd: root,
      timeoutMs: 20_000,
    });
    expect(result.passed).toBe(true);

    const app = await fs.readFile(path.join(root, 'site', 'src', 'App.vue'), 'utf8');
    expect(app).toContain('data-return-format="zip"');
    expect(app).toContain('data-demo-upload');
    expect(app).toContain('.7z');
    expect(app).toContain('Output: zip');
    expect(app).toContain('framework-loop.svg');
    expect(app).toContain('harness-map.svg');
    expect(app).toContain('deployment-flow.svg');
    expect(app).toContain('https://github.com/Hosico02/demo2project');
    expect(app).toContain('requestAnimationFrame');
    expect(app).toContain('onTouchstart');
  });
});
