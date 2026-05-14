import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { detectArchetype } from '../src/core/projectArchetypeDetector.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

async function mk(files: Record<string, string>) {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-arch-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content);
  }
  return dir;
}

describe('ProjectArchetypeDetector', () => {
  it('detects node-cli from package.json bin', async () => {
    const dir = await mk({ 'package.json': JSON.stringify({ name: 'x', bin: { x: 'bin/x.js' } }), 'bin/x.js': '#!/usr/bin/env node\n' });
    const r = await detectArchetype(dir);
    expect(r.primary.id).toBe('node-cli');
  });
  it('detects nextjs-app from next dep + app/', async () => {
    const dir = await mk({ 'package.json': JSON.stringify({ name: 'x', dependencies: { next: '^14', react: '^18' } }), 'app/page.tsx': 'export default function Page() { return null; }' });
    const r = await detectArchetype(dir);
    expect(r.primary.id).toBe('nextjs-app');
  });
  it('detects flask-web-app from Flask imports and app routes', async () => {
    const dir = await mk({
      'requirements.txt': 'flask>=3.0.0\npytest>=8.0.0\n',
      'app.py': [
        'from flask import Flask, jsonify',
        'app = Flask(__name__)',
        '@app.route("/healthz")',
        'def healthz():',
        '    return jsonify({"status": "ok"})',
        '',
      ].join('\n'),
      'tests/test_app.py': 'def test_healthz():\n    assert True\n',
    });
    const r = await detectArchetype(dir);
    expect(r.primary.id).toBe('flask-web-app');
    expect(r.primary.recommended_standard).toBe('flask-web-app');
  });
  it('detects vue-app from Vue/Vite source shape', async () => {
    const dir = await mk({
      'package.json': JSON.stringify({
        name: 'vue-ui',
        dependencies: { vue: '^3.5.0' },
        devDependencies: { vite: '^6.0.0', '@vitejs/plugin-vue': '^5.0.0' },
      }),
      'index.html': '<div id="app"></div><script type="module" src="/src/main.js"></script>',
      'src/main.js': 'import { createApp } from "vue"; import App from "./App.vue"; createApp(App).mount("#app");',
      'src/App.vue': '<template><main>Vue UI</main></template>',
    });
    const r = await detectArchetype(dir);
    expect(r.primary.id).toBe('vue-app');
    expect(r.primary.recommended_standard).toBe('vue-app');
  });
  it('detects agent-framework on this repo', async () => {
    const r = await detectArchetype(repoRoot);
    expect(r.primary.id).toBe('agent-framework');
    expect(r.primary.confidence).toBeGreaterThan(0.5);
  });
  it('returns "unknown" for empty dirs', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-empty-'));
    const r = await detectArchetype(dir);
    expect(['unknown', 'node-cli'].includes(r.primary.id)).toBe(true);
  });
});
