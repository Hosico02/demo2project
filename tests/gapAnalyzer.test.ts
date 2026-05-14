import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { AnalyzerAgent } from '../src/agents/AnalyzerAgent.js';
import { analyzeGaps, auditAgentMisjudgments } from '../src/core/gapAnalyzer.js';
import { writeMarketResearchReport } from '../src/research/MarketResearchAgent.js';
import type { MarketResearchReport } from '../src/research/types.js';
import { takeSnapshot } from '../src/core/projectSnapshot.js';
import type { ProjectScore, ProjectSnapshot } from '../src/core/types.js';
import { selectStandardForSnapshot } from '../src/standards/standardsLibrary.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const badDemo = path.resolve(here, '..', 'examples', 'bad-demo');

describe('gapAnalyzer', () => {
  it('flags missing README, missing tests, and missing test/build commands for bad-demo', async () => {
    const agent = new AnalyzerAgent();
    const { gap } = await agent.fullAnalyze(badDemo);
    const categories = gap.findings.map((f) => f.category);
    expect(categories).toContain('missing_readme');
    expect(categories).toContain('no_tests');
    expect(gap.findings.some((f) => f.category === 'missing_required_command' && /test/.test(f.message))).toBe(true);
    expect(gap.blockers.length).toBeGreaterThan(0);
  });

  it('flags Python projects with Node-only validation scaffolding', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-py-gap-'));
    await fs.mkdir(path.join(dir, '.github', 'workflows'), { recursive: true });
    await fs.writeFile(path.join(dir, 'README.md'), '# Demo\n\n' + 'x'.repeat(220));
    await fs.writeFile(path.join(dir, 'app.py'), 'print("hi")\n');
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask>=3.0.0\n');
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      scripts: {
        test: 'node --test tests',
        build: 'node -e "console.log(\'build ok\')"',
      },
    }));
    await fs.writeFile(path.join(dir, '.github', 'workflows', 'ci.yml'), 'name: CI\njobs:\n  test:\n    steps:\n      - run: npm test\n');

    const { gap, standard_name } = await new AnalyzerAgent().fullAnalyze(dir);
    const categories = gap.findings.map((f) => f.category);

    expect(standard_name).toBe('flask-web-app');
    expect(categories).toContain('no_python_tests');
    expect(categories).not.toContain('no_tests');
    expect(categories).not.toContain('missing_required_command');
    expect(categories).toContain('fake_build_command');
    expect(categories).toContain('misaligned_node_scaffold');
    expect(categories).toContain('misaligned_ci');
  });

  it('flags Flask demos that are not ready for public deployment', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-flask-prod-gap-'));
    await fs.mkdir(path.join(dir, 'templates'), { recursive: true });
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'README.md'), '# Flask Demo\n\nRun with python app.py.\n' + 'x'.repeat(220));
    await fs.writeFile(path.join(dir, 'app.py'), [
      'from flask import Flask, jsonify',
      'app = Flask(__name__)',
      '@app.route("/config")',
      'def config():',
      '    return jsonify({"ok": True})',
      '@app.route("/start", methods=["POST"])',
      'def start():',
      '    return jsonify({"game_id": "demo"})',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask>=3.0.0\npytest>=8.0\n');
    await fs.writeFile(path.join(dir, 'pyproject.toml'), '[project]\nname = "flask-demo"\n');
    await fs.writeFile(path.join(dir, 'tests', 'test_smoke.py'), 'def test_smoke():\n    assert True\n');

    const { gap, standard_name } = await new AnalyzerAgent().fullAnalyze(dir);
    const categories = gap.findings.map((f) => f.category);

    expect(standard_name).toBe('flask-web-app');
    expect(categories).toContain('missing_healthcheck');
    expect(categories).toContain('missing_config_guard');
    expect(categories).toContain('missing_wsgi_entrypoint');
    expect(categories).toContain('missing_python_production_server');
    expect(categories).toContain('missing_deployment_artifact');
    expect(categories).toContain('missing_api_tests');
    expect(categories).toContain('missing_deployment_docs');
  });

  it('flags pure UI demos without browser-level product verification', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-ui-product-gap-'));
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.writeFile(path.join(dir, 'README.md'), '# UI Demo\n\nRun the Vite app.\n' + 'x'.repeat(420));
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      name: 'ui-demo',
      scripts: {
        dev: 'vite',
        build: 'vite build',
        test: 'vitest run',
      },
      dependencies: {
        '@vitejs/plugin-react': '^5.0.0',
        vite: '^6.0.0',
        react: '^19.0.0',
        'react-dom': '^19.0.0',
      },
      devDependencies: {
        vitest: '^2.0.0',
      },
    }, null, 2));
    await fs.writeFile(path.join(dir, 'index.html'), '<div id="root"></div><script type="module" src="/src/App.jsx"></script>\n');
    await fs.writeFile(path.join(dir, 'src', 'App.jsx'), [
      'export default function App() {',
      '  return <div><h1>Matrix Dashboard</h1><button onClick={() => {}}>Launch</button></div>;',
      '}',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'src', 'App.test.jsx'), 'import { expect, test } from "vitest"; test("ok", () => expect(true).toBe(true));\n');

    const { gap, standard_name } = await new AnalyzerAgent().fullAnalyze(dir);
    const categories = gap.findings.map((f) => f.category);

    expect(standard_name).toBe('react-app');
    expect(categories).toContain('missing_ui_product_verification');
    expect(categories).toContain('below_web_ui_product_maturity');
    expect(categories).not.toContain('below_social_deduction_market_parity');
    expect(gap.product_maturity?.domain).toBe('web_ui_app');
    expect(gap.score.score_gate?.failures.some((f) => f.gate === 'product_maturity')).toBe(true);
  });

  it('flags UI projects whose browser harness lacks runtime render smoke checks', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-ui-render-gap-'));
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.mkdir(path.join(dir, 'tests', 'ui'), { recursive: true });
    await fs.writeFile(path.join(dir, 'README.md'), '# UI Demo\n\nRun the Vite app.\n' + 'x'.repeat(420));
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      name: 'ui-render-demo',
      scripts: {
        dev: 'vite',
        build: 'vite build',
        test: 'vitest run',
        'ui:e2e': 'playwright test',
      },
      dependencies: {
        '@vitejs/plugin-react': '^5.0.0',
        vite: '^6.0.0',
        react: '^19.0.0',
        'react-dom': '^19.0.0',
      },
      devDependencies: {
        '@playwright/test': '^1.52.0',
        vitest: '^2.0.0',
      },
    }, null, 2));
    await fs.writeFile(path.join(dir, 'index.html'), '<div id="root"></div><script type="module" src="/src/App.jsx"></script>\n');
    await fs.writeFile(path.join(dir, 'playwright.config.ts'), 'export default {};\n');
    await fs.writeFile(path.join(dir, 'tests', 'ui', 'smoke.spec.ts'), 'import { test } from "@playwright/test"; test("loads", async ({ page }) => { await page.goto("/"); });\n');
    await fs.writeFile(path.join(dir, 'src', 'App.jsx'), [
      'import "./style.css";',
      'export default function App() { return <main aria-label="Console"><h1>Matrix Dashboard</h1><button>Launch</button></main>; }',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'src', 'style.css'), [
      ':root { --accent: #38bdf8; font-family: Inter, sans-serif; }',
      'main { display: grid; gap: 16px; }',
      '@media (max-width: 640px) { main { padding: 12px; } }',
      'button:hover, button:focus-visible { outline: 2px solid var(--accent); }',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'src', 'App.test.jsx'), 'import { expect, test } from "vitest"; test("ok", () => expect(1 + 1).toBe(2));\n');

    const { gap } = await new AnalyzerAgent().fullAnalyze(dir);
    const categories = gap.findings.map((f) => f.category);

    expect(categories).not.toContain('missing_ui_product_verification');
    expect(categories).toContain('missing_ui_runtime_render_smoke');
  });

  it('flags single-file demos without an intake/runtime contract harness', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-single-file-gap-'));
    await fs.writeFile(path.join(dir, 'demo.py'), [
      'def main():',
      '    print("hello demo")',
      '',
      'if __name__ == "__main__":',
      '    main()',
      '',
    ].join('\n'));

    const { gap } = await new AnalyzerAgent().fullAnalyze(dir);
    const categories = gap.findings.map((f) => f.category);

    expect(categories).toContain('single_file_demo_without_intake_harness');
  });

  it('does not flag single-file demos after the intake/runtime contract harness exists', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-single-file-harnessed-gap-'));
    await fs.mkdir(path.join(dir, 'scripts'), { recursive: true });
    await fs.mkdir(path.join(dir, 'docs'), { recursive: true });
    await fs.writeFile(path.join(dir, 'demo.py'), 'print("hello demo")\n');
    await fs.writeFile(path.join(dir, 'scripts', 'demo-runtime-check.mjs'), 'console.log("ok")\n');
    await fs.writeFile(path.join(dir, 'docs', 'demo-intake.md'), '# Demo Intake\n\nEntry: demo.py\n');
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      scripts: {
        test: 'python3 -m pytest -q',
        build: 'python3 -m py_compile demo.py',
        'demo:intake-check': 'node scripts/demo-runtime-check.mjs',
      },
    }, null, 2));

    const { gap } = await new AnalyzerAgent().fullAnalyze(dir);
    const categories = gap.findings.map((f) => f.category);

    expect(categories).not.toContain('single_file_demo_without_intake_harness');
    expect(categories).not.toContain('misaligned_node_scaffold');
  });

  it('flags CLI projects without an executable contract harness', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-cli-contract-gap-'));
    await fs.mkdir(path.join(dir, 'bin'), { recursive: true });
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'README.md'), '# CLI Demo\n\nRun the CLI.\n' + 'x'.repeat(420));
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      name: 'cli-demo',
      bin: './bin/cli.js',
      scripts: {
        test: 'node --test tests/smoke.test.mjs',
        build: 'node --check bin/cli.js',
      },
    }, null, 2));
    await fs.writeFile(path.join(dir, 'bin', 'cli.js'), '#!/usr/bin/env node\nif (process.argv.includes("--help")) console.log("Usage: cli-demo");\n');
    await fs.writeFile(path.join(dir, 'tests', 'smoke.test.mjs'), 'import test from "node:test"; test("ok", () => {});\n');

    const { gap } = await new AnalyzerAgent().fullAnalyze(dir);
    const categories = gap.findings.map((f) => f.category);

    expect(categories).toContain('missing_cli_contract_harness');
  });

  it('does not flag CLI projects after an executable contract harness exists', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-cli-contract-ready-gap-'));
    await fs.mkdir(path.join(dir, 'bin'), { recursive: true });
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.mkdir(path.join(dir, 'scripts'), { recursive: true });
    await fs.mkdir(path.join(dir, 'docs'), { recursive: true });
    await fs.writeFile(path.join(dir, 'README.md'), '# CLI Demo\n\nRun the CLI.\n' + 'x'.repeat(420));
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      name: 'cli-demo',
      bin: './bin/cli.js',
      scripts: {
        test: 'node --test tests/smoke.test.mjs',
        build: 'node --check bin/cli.js',
        'cli:contract-check': 'node scripts/cli-contract-check.mjs',
      },
    }, null, 2));
    await fs.writeFile(path.join(dir, 'bin', 'cli.js'), '#!/usr/bin/env node\nif (process.argv.includes("--help")) console.log("Usage: cli-demo");\n');
    await fs.writeFile(path.join(dir, 'tests', 'smoke.test.mjs'), 'import test from "node:test"; test("ok", () => {});\n');
    await fs.writeFile(path.join(dir, 'scripts', 'cli-contract-check.mjs'), 'console.log("ok")\n');
    await fs.writeFile(path.join(dir, 'docs', 'cli-contract.md'), '# CLI Contract\n');

    const { gap } = await new AnalyzerAgent().fullAnalyze(dir);
    const categories = gap.findings.map((f) => f.category);

    expect(categories).not.toContain('missing_cli_contract_harness');
  });

  it('flags common UI interaction, accessibility and polish risks across UI projects', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-ui-hardening-gap-'));
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.mkdir(path.join(dir, 'example'), { recursive: true });
    await fs.writeFile(path.join(dir, 'README.md'), '# UI Demo\n\nRun the Vite app.\n' + 'x'.repeat(420));
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      name: 'ui-hardening-demo',
      scripts: { dev: 'vite', build: 'vite build', test: 'node --test tests/smoke.test.mjs' },
      dependencies: { vue: '^3.5.0', vite: '^6.0.0' },
      devDependencies: { '@vitejs/plugin-vue': '^5.0.0' },
    }, null, 2));
    await fs.writeFile(path.join(dir, 'index.html'), '<div id="app"></div><script type="module" src="/src/App.vue"></script>\n');
    await fs.writeFile(path.join(dir, 'src', 'App.vue'), [
      '<template>',
      '  <nav class="nav"><a href="#about">About</a></nav>',
      '  <section id="about" class="panel flip-panel" @mouseenter="flipOn(\'about\')" @mouseleave="flipOff(\'about\')">',
      '    <p>Welcome to my website.</p>',
      '  </section>',
      '</template>',
      '<script setup>',
      "import { ref, onMounted } from 'vue'",
      'const cursorX = ref(0)',
      'const cursorY = ref(0)',
      'onMounted(() => {',
      '  document.addEventListener("mousemove", (event) => {',
      '    cursorX.value = event.clientX',
      '    cursorY.value = event.clientY',
      '  })',
      '})',
      '</script>',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'src', 'style.css'), [
      'body { cursor: none; }',
      '.topbar { position: sticky; top: 0; }',
      '.brand { letter-spacing: 0.22em; }',
      '.hero-title__name { font-size: 7.25rem; }',
      '.cursor-core { width: 168px; }',
      '.cursor-core { width: 168px; }',
      '.eyebrow, .subcopy { margin: 0; }',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'example', 'index.html'), '<section class="panel flip-panel" id="about" data-flip-panel><p>Panel</p></section>\n');
    await fs.writeFile(path.join(dir, 'example', 'style.css'), '.brand { letter-spacing: 0; }\n.hero-title__name { font-size: 7.25rem; }\n');

    const { gap } = await new AnalyzerAgent().fullAnalyze(dir);
    const categories = gap.findings.map((f) => f.category);

    expect(categories).toContain('ui_pointer_only_interaction');
    expect(categories).toContain('ui_hidden_system_cursor');
    expect(categories).toContain('ui_reactive_mousemove_cursor');
    expect(categories).toContain('ui_fixed_title_scale');
    expect(categories).toContain('ui_sticky_anchor_overlap');
    expect(categories).toContain('ui_placeholder_copy');
    expect(categories).toContain('ui_navigation_semantics');
    expect(categories).toContain('ui_css_cleanup_needed');
    expect(categories).toContain('ui_variant_style_drift');
  });

  it('flags UI pages that promise hosted file processing without backend evidence', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-ui-service-claim-gap-'));
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.writeFile(path.join(dir, 'README.md'), '# UI Service Demo\n\nRun the Vite app.\n' + 'x'.repeat(420));
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      name: 'ui-service-claim-demo',
      scripts: { dev: 'vite', build: 'vite build', test: 'vitest run' },
      dependencies: { vue: '^3.5.0', vite: '^6.0.0' },
      devDependencies: { '@vitejs/plugin-vue': '^5.0.0', vitest: '^2.0.0' },
    }, null, 2));
    await fs.writeFile(path.join(dir, 'index.html'), '<div id="app"></div><script type="module" src="/src/App.vue"></script>\n');
    await fs.writeFile(path.join(dir, 'src', 'App.vue'), [
      '<template>',
      '  <main>',
      '    <h1>Upload a demo. Receive a product zip.</h1>',
      '    <form data-upload-form data-return-format="zip">',
      '      <input type="file" data-demo-upload accept=".zip,.7z,.rar,.tar,.tar.gz,.tgz" />',
      '      <p>MatrixOmnix will process the archive and return a productized zip artifact.</p>',
      '    </form>',
      '  </main>',
      '</template>',
      '',
    ].join('\n'));

    const { gap } = await new AnalyzerAgent().fullAnalyze(dir);
    const serviceClaim = gap.findings.find((f) => f.category === 'ui_unimplemented_hosted_service_claim');

    expect(serviceClaim?.severity).toBe('high');
    expect(serviceClaim?.related_files).toContain('src/App.vue');
  });

  it('does not flag explicit beta usage guides as hosted service claims', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-ui-beta-guide-gap-'));
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.writeFile(path.join(dir, 'README.md'), '# UI Beta Guide\n\nRun the Vite app.\n' + 'x'.repeat(420));
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      name: 'ui-beta-guide-demo',
      scripts: { dev: 'vite', build: 'vite build', test: 'vitest run' },
      dependencies: { vue: '^3.5.0', vite: '^6.0.0' },
      devDependencies: { '@vitejs/plugin-vue': '^5.0.0', vitest: '^2.0.0' },
    }, null, 2));
    await fs.writeFile(path.join(dir, 'index.html'), '<div id="app"></div><script type="module" src="/src/App.vue"></script>\n');
    await fs.writeFile(path.join(dir, 'src', 'App.vue'), [
      '<template>',
      '  <main>',
      '    <h1>How to use MatrixOmnix beta.</h1>',
      '    <p>MatrixOmnix is not a hosted file-processing service yet. Use the beta locally from the CLI.</p>',
      '    <code>pnpm matrixomnix analyze --project ./demo</code>',
      '  </main>',
      '</template>',
      '',
    ].join('\n'));

    const { gap } = await new AnalyzerAgent().fullAnalyze(dir);
    const categories = gap.findings.map((f) => f.category);

    expect(categories).not.toContain('ui_unimplemented_hosted_service_claim');
  });

  it('flags a missing Flask start guard even when API key text appears elsewhere', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-flask-guard-gap-'));
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'README.md'), '# Flask Demo\n\nDocker gunicorn healthz\n' + 'x'.repeat(220));
    await fs.writeFile(path.join(dir, 'app.py'), [
      '"""Set DEEPSEEK_API_KEY before running publicly."""',
      'from flask import Flask, jsonify',
      'from config import has_api_key, missing_api_key_payload, public_config',
      'app = Flask(__name__)',
      '@app.route("/healthz")',
      'def healthz():',
      '    return jsonify({"ok": True, "llm_configured": public_config()["has_key"]})',
      '@app.route("/start", methods=["POST"])',
      'def start():',
      '    return jsonify({"game_id": "demo"})',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'config.py'), [
      'import os',
      'def has_api_key():',
      '    return bool(os.environ.get("DEEPSEEK_API_KEY") or os.environ.get("OPENAI_API_KEY"))',
      'def missing_api_key_payload():',
      '    return {"error": "missing_api_key"}',
      'def public_config():',
      '    return {"has_key": has_api_key()}',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask>=3.0.0\npytest>=8.0\ngunicorn>=22.0.0\n');
    await fs.writeFile(path.join(dir, 'pyproject.toml'), '[project]\nname = "flask-demo"\n');
    await fs.writeFile(path.join(dir, 'Dockerfile'), 'FROM python:3.11-slim\nHEALTHCHECK CMD curl http://127.0.0.1:5001/healthz\n');
    await fs.writeFile(path.join(dir, 'wsgi.py'), 'from app import app\n');
    await fs.writeFile(path.join(dir, 'tests', 'test_app.py'), 'def test_api(client):\n    assert "/start"\n');

    const { gap } = await new AnalyzerAgent().fullAnalyze(dir);
    const categories = gap.findings.map((f) => f.category);

    expect(categories).toContain('missing_config_guard');
  });

  it('accepts Flask start guards that call require_api_key and return 400 on failure', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-flask-require-guard-'));
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'README.md'), '# Flask Demo\n\nDocker gunicorn healthz\n' + 'x'.repeat(220));
    await fs.writeFile(path.join(dir, 'app.py'), [
      'from flask import Flask, jsonify',
      'from config import require_api_key',
      'app = Flask(__name__)',
      '@app.route("/healthz")',
      'def healthz():',
      '    return jsonify({"status": "ok"})',
      '@app.route("/start", methods=["POST"])',
      'def start():',
      '    has_key, error_msg = require_api_key()',
      '    if not has_key:',
      '        return jsonify({"error": error_msg}), 400',
      '    return jsonify({"game_id": "demo"})',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'config.py'), [
      'def require_api_key():',
      '    return False, "missing"',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask>=3.0.0\npytest>=8.0\ngunicorn>=22.0.0\n');
    await fs.writeFile(path.join(dir, 'pyproject.toml'), '[project]\nname = "flask-demo"\n');
    await fs.writeFile(path.join(dir, 'Dockerfile'), 'FROM python:3.11-slim\nHEALTHCHECK CMD curl http://127.0.0.1:5001/healthz\n');
    await fs.writeFile(path.join(dir, 'wsgi.py'), 'from app import app\n');
    await fs.writeFile(path.join(dir, 'tests', 'test_app.py'), 'def test_api(client):\n    assert "/start"\n');

    const { gap } = await new AnalyzerAgent().fullAnalyze(dir);
    const categories = gap.findings.map((f) => f.category);

    expect(categories).not.toContain('missing_config_guard');
  });

  it('flags Flask demos missing industrial runtime controls', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-flask-industrial-gap-'));
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'README.md'), '# Flask Demo\n\nDocker gunicorn healthz\n' + 'x'.repeat(220));
    await fs.writeFile(path.join(dir, 'app.py'), [
      'from flask import Flask, jsonify, request',
      'from config import require_api_key',
      'GAME_MODES = {"m6": {"name": "six"}}',
      'DEFAULT_MODE = "m6"',
      '_games = {}',
      'app = Flask(__name__)',
      '@app.route("/healthz")',
      'def healthz():',
      '    return jsonify({"status": "ok"})',
      '@app.route("/start", methods=["POST"])',
      'def start():',
      '    has_key, error_msg = require_api_key()',
      '    if not has_key:',
      '        return jsonify({"error": error_msg}), 400',
      '    body = request.get_json(silent=True) or {}',
      '    mode = body.get("mode", DEFAULT_MODE)',
      '    speed = body.get("speed", 1.0)',
      '    _games["x"] = {"queue": None}',
      '    return jsonify({"game_id": "x", "mode": mode, "speed": speed})',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'config.py'), [
      'def require_api_key():',
      '    return True, ""',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask>=3.0.0\npytest>=8.0\ngunicorn>=22.0.0\n');
    await fs.writeFile(path.join(dir, 'pyproject.toml'), '[project]\nname = "flask-demo"\n');
    await fs.writeFile(path.join(dir, 'Dockerfile'), 'FROM python:3.11-slim\nHEALTHCHECK CMD curl http://127.0.0.1:5001/healthz\n');
    await fs.writeFile(path.join(dir, 'wsgi.py'), 'from app import app\n');
    await fs.writeFile(path.join(dir, 'tests', 'test_app.py'), 'def test_healthz():\n    assert True\n');

    const { gap } = await new AnalyzerAgent().fullAnalyze(dir);
    const categories = gap.findings.map((f) => f.category);

    expect(categories).toContain('missing_security_headers');
    expect(categories).toContain('missing_start_input_validation');
    expect(categories).toContain('missing_active_game_limit');
    expect(categories).toContain('missing_structured_logging');
    expect(categories).toContain('missing_industrial_api_tests');
  });

  it('caps a production score when high-severity gaps remain open', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-flask-gap-gated-score-'));
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'README.md'), '# Flask Demo\n\nDocker gunicorn healthz\n' + 'x'.repeat(500));
    await fs.writeFile(path.join(dir, 'app.py'), [
      'from flask import Flask, jsonify, request',
      'from config import require_api_key',
      'GAME_MODES = {"m6": {"name": "six"}}',
      'DEFAULT_MODE = "m6"',
      '_games = {}',
      'app = Flask(__name__)',
      '@app.route("/healthz")',
      'def healthz():',
      '    return jsonify({"status": "ok"})',
      '@app.route("/start", methods=["POST"])',
      'def start():',
      '    has_key, error_msg = require_api_key()',
      '    if not has_key:',
      '        return jsonify({"error": error_msg}), 400',
      '    body = request.get_json(silent=True) or {}',
      '    mode = body.get("mode", DEFAULT_MODE)',
      '    speed = body.get("speed", 1.0)',
      '    _games["x"] = {"queue": None}',
      '    return jsonify({"game_id": "x", "mode": mode, "speed": speed})',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'config.py'), [
      'def require_api_key():',
      '    return True, ""',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask>=3.0.0\npytest>=8.0\ngunicorn>=22.0.0\n');
    await fs.writeFile(path.join(dir, 'pyproject.toml'), '[project]\nname = "flask-demo"\n');
    await fs.writeFile(path.join(dir, 'Dockerfile'), 'FROM python:3.11-slim\nHEALTHCHECK CMD curl http://127.0.0.1:5001/healthz\n');
    await fs.writeFile(path.join(dir, 'wsgi.py'), 'from app import app\n');
    await fs.writeFile(path.join(dir, 'tests', 'test_app.py'), 'def test_healthz():\n    assert True\n');

    const snapshot = await takeSnapshot(dir);
    const { standard } = await selectStandardForSnapshot(snapshot);
    const optimisticScore: ProjectScore = {
      total: 92,
      grade: 'production_ready_baseline',
      breakdown: {
        structure_score: 10,
        test_score: 18,
        build_score: 12,
        runtime_score: 10,
        docs_score: 10,
        config_score: 8,
        maintainability_score: 10,
        safety_score: 8,
        agent_process_score: 14,
      },
      notes: [],
      score_evidence: [],
      score_gate: { status: 'passed', cap: 100, failures: [] },
    };

    const gap = await analyzeGaps(snapshot, optimisticScore, standard);

    expect(gap.findings.some((f) => f.severity === 'high')).toBe(true);
    expect(gap.score.score_gate?.status).toBe('failed');
    expect(gap.score.score_gate?.failures.some((f) => f.gate === 'gap')).toBe(true);
    expect(gap.score.total).toBeLessThanOrEqual(79);
    expect(gap.score.grade).not.toBe('production_ready_baseline');
    expect(gap.score.notes.join('\n')).toMatch(/high-severity gap/i);
  });

  it('returns the gap-gated score from full analysis', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-full-analysis-gap-gated-score-'));
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'README.md'), '# Flask Demo\n\nDocker gunicorn healthz\n' + 'x'.repeat(500));
    await fs.writeFile(path.join(dir, 'app.py'), [
      'from flask import Flask, jsonify, request',
      'from config import require_api_key',
      'GAME_MODES = {"m6": {"name": "six"}}',
      'DEFAULT_MODE = "m6"',
      '_games = {}',
      'app = Flask(__name__)',
      '@app.route("/healthz")',
      'def healthz():',
      '    return jsonify({"status": "ok"})',
      '@app.route("/start", methods=["POST"])',
      'def start():',
      '    has_key, error_msg = require_api_key()',
      '    if not has_key:',
      '        return jsonify({"error": error_msg}), 400',
      '    body = request.get_json(silent=True) or {}',
      '    mode = body.get("mode", DEFAULT_MODE)',
      '    speed = body.get("speed", 1.0)',
      '    _games["x"] = {"queue": None}',
      '    return jsonify({"game_id": "x", "mode": mode, "speed": speed})',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'config.py'), [
      'def require_api_key():',
      '    return True, ""',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask>=3.0.0\npytest>=8.0\ngunicorn>=22.0.0\n');
    await fs.writeFile(path.join(dir, 'pyproject.toml'), '[project]\nname = "flask-demo"\n');
    await fs.writeFile(path.join(dir, 'Dockerfile'), 'FROM python:3.11-slim\nHEALTHCHECK CMD curl http://127.0.0.1:5001/healthz\n');
    await fs.writeFile(path.join(dir, 'wsgi.py'), 'from app import app\n');
    await fs.writeFile(path.join(dir, 'tests', 'test_app.py'), 'def test_healthz():\n    assert True\n');

    const { score, gap } = await new AnalyzerAgent().fullAnalyze(dir);

    expect(score.total).toBe(gap.score.total);
    expect(score.grade).toBe(gap.score.grade);
    expect(score.score_gate?.failures.some((f) => f.gate === 'gap')).toBe(true);
  });

  it('turns failed verification evidence into blocker gap findings', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-verification-gap-'));
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'README.md'), '# Demo\n\n' + 'x'.repeat(240));
    await fs.writeFile(path.join(dir, 'app.py'), 'print("demo")\n');
    await fs.writeFile(path.join(dir, 'tests', 'test_app.py'), 'def test_fail():\n    assert False\n');
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'pytest>=8.0\n');
    const snapshot = await takeSnapshot(dir);
    const { standard } = await selectStandardForSnapshot(snapshot);
    const failedScore: ProjectScore = {
      total: 49,
      grade: 'working_demo',
      breakdown: {
        structure_score: 5,
        test_score: 10,
        build_score: 0,
        runtime_score: 4,
        docs_score: 5,
        config_score: 0,
        maintainability_score: 8,
        safety_score: 8,
        agent_process_score: 0,
      },
      notes: ['score gate failed: test command failed (cap 49)'],
      score_evidence: [
        {
          dimension: 'test_score',
          claimed: true,
          verified: true,
          evidence_command: 'python3 -m pytest -q',
          result: 'failed',
          confidence: 'high',
        },
      ],
      score_gate: {
        status: 'failed',
        cap: 49,
        failures: [
          {
            gate: 'test',
            cap: 49,
            reason: 'test command failed',
            evidence_command: 'python3 -m pytest -q',
          },
        ],
      },
    };

    const gap = await analyzeGaps(snapshot, failedScore, standard);
    const verificationFinding = gap.findings.find((f) => f.category === 'failed_test_verification');

    expect(verificationFinding?.severity).toBe('blocker');
    expect(verificationFinding?.message).toContain('python3 -m pytest -q');
    expect(gap.blockers.map((f) => f.category)).toContain('failed_test_verification');
  });

  it('flags Python products without dependency constraint policy', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-python-dep-policy-gap-'));
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'README.md'), '# Python Demo\n\nInstall with pip install -r requirements.txt.\n' + 'x'.repeat(260));
    await fs.writeFile(path.join(dir, 'app.py'), 'print("demo")\n');
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask>=3.0.0\nopenai>=1.0.0\npytest>=8.0.0\n');
    await fs.writeFile(path.join(dir, 'pyproject.toml'), '[project]\nname = "demo"\ndependencies = ["flask>=3.0.0"]\n');
    await fs.writeFile(path.join(dir, 'tests', 'test_smoke.py'), 'def test_smoke():\n    assert True\n');

    const { gap } = await new AnalyzerAgent().fullAnalyze(dir);
    const categories = gap.findings.map((f) => f.category);

    expect(categories).toContain('missing_python_dependency_constraints');
    expect(categories).toContain('unbounded_python_dependencies');
  });

  it('flags Flask products without regression tests and operational docs', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-flask-regression-docs-gap-'));
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'README.md'), '# Flask Demo\n\nDocker gunicorn healthz\n' + 'x'.repeat(260));
    await fs.writeFile(path.join(dir, 'app.py'), [
      'from flask import Flask, jsonify',
      'app = Flask(__name__)',
      '@app.route("/healthz")',
      'def healthz():',
      '    return jsonify({"status": "ok"})',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask>=3.0.0,<4.0.0\npytest>=8.0.0,<9.0.0\n');
    await fs.writeFile(path.join(dir, 'constraints.txt'), 'flask>=3.0.0,<4.0.0\npytest>=8.0.0,<9.0.0\n');
    await fs.writeFile(path.join(dir, 'pyproject.toml'), '[project]\nname = "flask-demo"\n');
    await fs.writeFile(path.join(dir, 'Dockerfile'), 'FROM python:3.11-slim\nHEALTHCHECK CMD curl http://127.0.0.1:5001/healthz\n');
    await fs.writeFile(path.join(dir, 'wsgi.py'), 'from app import app\n');
    await fs.writeFile(path.join(dir, 'tests', 'test_app.py'), 'def test_healthz():\n    assert True\n');

    const { gap } = await new AnalyzerAgent().fullAnalyze(dir);
    const categories = gap.findings.map((f) => f.category);

    expect(categories).toContain('missing_regression_tests');
    expect(categories).toContain('missing_operational_docs');
  });

  it('flags social deduction demos that still keep game rules as untested demo logic', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-werewolf-content-gap-'));
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'README.md'), '# Werewolf Demo\n\n## Quick Start\n\nRun the game.\n' + 'x'.repeat(260));
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'pytest>=8.0.0,<9.0.0\n');
    await fs.writeFile(path.join(dir, 'constraints.txt'), 'pytest>=8.0.0,<9.0.0\n');
    await fs.writeFile(path.join(dir, 'game.py'), [
      'import random',
      'from collections import Counter',
      'GAME_MODES = {"m6": {"roles": ["werewolf", "seer", "witch", "villager"]}}',
      'class GameMaster:',
      '    def alive(self):',
      '        return []',
      '    def _balance(self):',
      '        return 1, 1',
      '    def winner(self):',
      '        wolves, goods = self._balance()',
      '        if wolves == 0:',
      '            return "好人"',
      '        if wolves >= goods:',
      '            return "狼人"',
      '        return None',
      '    def day_phase(self):',
      '        tally = Counter({1: 2, 2: 2})',
      '        cands = [1, 2]',
      '        executed = random.choice(cands)',
      '        return executed',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'tests', 'test_smoke.py'), 'def test_smoke():\n    assert True\n');

    const { gap } = await new AnalyzerAgent().fullAnalyze(dir);
    const categories = gap.findings.map((f) => f.category);

    expect(categories).toContain('missing_social_deduction_rules_engine');
    expect(categories).toContain('random_social_deduction_tie_breaker');
    expect(categories).toContain('missing_social_deduction_rule_tests');
  });

  it('flags social deduction projects whose rule engine does not validate game modes', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-werewolf-mode-gap-'));
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'README.md'), '# Werewolf Demo\n\n狼人杀 product candidate.\n' + 'x'.repeat(260));
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'pytest>=8.0.0,<9.0.0\n');
    await fs.writeFile(path.join(dir, 'constraints.txt'), 'pytest>=8.0.0,<9.0.0\n');
    await fs.writeFile(path.join(dir, 'game.py'), [
      'from rules import resolve_vote_result, winner_from_alive_roles',
      'GAME_MODES = {"m6": {"roles": ["werewolf", "seer", "witch", "villager", "villager", "werewolf"]}}',
      'class GameMaster:',
      '    def alive(self):',
      '        return []',
      '    def winner(self):',
      '        return winner_from_alive_roles([])',
      '    def day_phase(self):',
      '        return resolve_vote_result({1: {"target": 2}})',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'rules.py'), [
      'from collections import Counter',
      'def role_distribution(roles):',
      '    return dict(Counter(roles))',
      'def winner_from_alive_roles(roles):',
      '    return None',
      'def resolve_vote_result(votes):',
      '    return {"outcome": "none"}',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'tests', 'test_rules.py'), 'from rules import resolve_vote_result\n\ndef test_vote():\n    assert resolve_vote_result({})["outcome"] == "none"\n');

    const { gap } = await new AnalyzerAgent().fullAnalyze(dir);
    const categories = gap.findings.map((f) => f.category);

    expect(categories).toContain('missing_social_deduction_mode_validation');
    expect(categories).toContain('missing_social_deduction_mode_tests');
  });

  it('flags social deduction projects that define mode validation but do not enforce it at startup', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-werewolf-startup-mode-gap-'));
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'README.md'), '# Werewolf Demo\n\n狼人杀 product candidate.\n' + 'x'.repeat(260));
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'pytest>=8.0.0,<9.0.0\n');
    await fs.writeFile(path.join(dir, 'constraints.txt'), 'pytest>=8.0.0,<9.0.0\n');
    await fs.writeFile(path.join(dir, 'game.py'), [
      'from rules import resolve_vote_result, validate_game_modes, winner_from_alive_roles',
      'GAME_MODES = {"m6": {"roles": ["werewolf", "seer", "witch", "villager", "villager", "werewolf"]}}',
      'class GameMaster:',
      '    def alive(self):',
      '        return []',
      '    def winner(self):',
      '        return winner_from_alive_roles([])',
      '    def day_phase(self):',
      '        return resolve_vote_result({1: {"target": 2}})',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'rules.py'), [
      'def role_distribution(roles):',
      '    return {}',
      'def validate_mode_config(mode_id, roles):',
      '    return {"ok": "werewolf" in roles, "distribution": role_distribution(roles)}',
      'def validate_game_modes(modes):',
      '    return {"ok": True, "modes": {}}',
      'def winner_from_alive_roles(roles):',
      '    return None',
      'def resolve_vote_result(votes):',
      '    return {"outcome": "none"}',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'tests', 'test_rules.py'), [
      'from rules import validate_mode_config, validate_game_modes',
      'def test_mode_config_validation_rejects_wolf_majority():',
      '    assert validate_mode_config("x", ["werewolf"])',
      '',
    ].join('\n'));

    const { gap } = await new AnalyzerAgent().fullAnalyze(dir);
    const categories = gap.findings.map((f) => f.category);

    expect(categories).toContain('missing_social_deduction_mode_startup_guard');
  });

  it('separates engineering baseline from mature social deduction market parity', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-werewolf-market-gap-'));
    await fs.mkdir(path.join(dir, 'docs'), { recursive: true });
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.mkdir(path.join(dir, '.github', 'workflows'), { recursive: true });
    await fs.writeFile(path.join(dir, 'README.md'), '# Werewolf Product Candidate\n\nA tested狼人杀 social deduction game.\n' + 'x'.repeat(420));
    await fs.writeFile(path.join(dir, 'docs', 'market-parity.md'), [
      '# Market Parity Roadmap',
      'Future work: account profile login lobby room matchmaking voice chat websocket moderation report mute block ranked season leaderboard match history replay shop cosmetics admin metrics custom host controls.',
      'This is only a roadmap; it must not satisfy implementation capabilities.',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask>=3.0.0,<4.0.0\npytest>=8.0.0,<9.0.0\ngunicorn>=22.0.0,<23.0.0\n');
    await fs.writeFile(path.join(dir, 'constraints.txt'), 'flask>=3.0.0,<4.0.0\npytest>=8.0.0,<9.0.0\ngunicorn>=22.0.0,<23.0.0\n');
    await fs.writeFile(path.join(dir, 'pyproject.toml'), '[project]\nname = "werewolf-product-candidate"\n');
    await fs.writeFile(path.join(dir, 'Dockerfile'), 'FROM python:3.11-slim\nCMD ["gunicorn", "wsgi:app"]\n');
    await fs.writeFile(path.join(dir, 'wsgi.py'), 'from app import app\n');
    await fs.writeFile(path.join(dir, '.github', 'workflows', 'ci.yml'), 'name: CI\njobs:\n  test:\n    steps:\n      - run: python3 -m pytest -q\n');
    await fs.writeFile(path.join(dir, 'app.py'), [
      'from flask import Flask, jsonify',
      'app = Flask(__name__)',
      '@app.route("/healthz")',
      'def healthz():',
      '    return jsonify({"status": "ok"})',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'game.py'), [
      'from rules import resolve_vote_result, validate_game_modes, winner_from_alive_roles',
      'GAME_MODES = {"m6": {"roles": ["werewolf", "werewolf", "seer", "witch", "villager", "villager"]}}',
      '_MODE_VALIDATION = validate_game_modes(GAME_MODES)',
      'if not _MODE_VALIDATION["ok"]:',
      '    raise ValueError("bad modes")',
      'class GameMaster:',
      '    def winner(self):',
      '        return winner_from_alive_roles(["werewolf", "villager"])',
      '    def day_phase(self):',
      '        return resolve_vote_result({1: {"target": 2}})',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'rules.py'), [
      'from collections import Counter',
      'def role_distribution(roles):',
      '    return dict(Counter(roles))',
      'def validate_mode_config(mode_id, roles):',
      '    return {"ok": "werewolf" in roles, "distribution": role_distribution(roles)}',
      'def validate_game_modes(modes):',
      '    return {"ok": True, "modes": {}}',
      'def winner_from_alive_roles(roles):',
      '    return None',
      'def resolve_vote_result(votes):',
      '    return {"outcome": "executed", "executed": 2}',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'tests', 'test_rules.py'), [
      'from rules import resolve_vote_result, validate_mode_config',
      'def test_tied_vote_has_no_random_execution():',
      '    assert resolve_vote_result({})["outcome"] == "executed"',
      'def test_mode_config_validation_rejects_wolf_majority():',
      '    assert validate_mode_config("x", ["werewolf"])',
      '',
    ].join('\n'));

    const { gap } = await new AnalyzerAgent().fullAnalyze(dir);
    const categories = gap.findings.map((f) => f.category);

    expect(gap.product_maturity?.domain).toBe('social_deduction_game');
    expect(gap.product_maturity?.level).not.toBe('market_ready');
    expect(gap.product_maturity?.score).toBeLessThanOrEqual(25);
    expect(gap.product_maturity?.missing_capabilities).toContain('Account identity and player profiles');
    expect(categories).toContain('below_social_deduction_market_parity');
    expect(gap.score.score_gate?.failures.some((f) => f.gate === 'product_maturity')).toBe(true);
    expect(gap.score.total).toBeLessThanOrEqual(gap.product_maturity?.score ?? 100);
    const confidenceAdjusted = (gap.score as typeof gap.score & { confidence_adjusted_score?: number }).confidence_adjusted_score;
    if (confidenceAdjusted !== undefined) expect(confidenceAdjusted).toBeLessThanOrEqual(gap.score.total);
  });

  it('does not apply social deduction optimization to unrelated voting games', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-voting-game-no-werewolf-'));
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.mkdir(path.join(dir, '.github', 'workflows'), { recursive: true });
    await fs.writeFile(path.join(dir, 'README.md'), '# Voting Game\n\nA party demo where players vote on prompts and the host resolves poll results.\n' + 'x'.repeat(420));
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'pytest>=8.0.0,<9.0.0\nflask>=3.0.0,<4.0.0\n');
    await fs.writeFile(path.join(dir, 'pyproject.toml'), '[project]\nname = "voting-game"\n');
    await fs.writeFile(path.join(dir, 'Dockerfile'), 'FROM python:3.11-slim\n');
    await fs.writeFile(path.join(dir, 'wsgi.py'), 'from app import app\n');
    await fs.writeFile(path.join(dir, '.github', 'workflows', 'ci.yml'), 'name: CI\njobs:\n  test:\n    steps:\n      - run: python3 -m pytest -q\n');
    await fs.writeFile(path.join(dir, 'app.py'), [
      'from flask import Flask, jsonify',
      'app = Flask(__name__)',
      '@app.route("/healthz")',
      'def healthz():',
      '    return jsonify({"status": "ok"})',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'game.py'), [
      'GAME_MODES = {"quick_vote": {"rounds": 3}}',
      'class GameMaster:',
      '    def __init__(self):',
      '        self.votes = []',
      '    def record_vote(self, player_id, option):',
      '        self.votes.append((player_id, option))',
      '    def winner(self):',
      '        return max((option for _, option in self.votes), default=None)',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'tests', 'test_game.py'), [
      'from game import GameMaster',
      'def test_vote_winner_empty_poll():',
      '    assert GameMaster().winner() is None',
      '',
    ].join('\n'));

    const { gap } = await new AnalyzerAgent().fullAnalyze(dir);
    const categories = gap.findings.map((f) => f.category);

    expect(categories).not.toContain('missing_social_deduction_rules_engine');
    expect(categories).not.toContain('below_social_deduction_market_parity');
    expect(gap.product_maturity).toBeUndefined();
    expect(gap.score.score_gate?.failures.some((f) => f.gate === 'product_maturity')).not.toBe(true);
  });

  it('adds source-cited market research gaps when a research report exists', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-research-gap-integration-'));
    await fs.writeFile(path.join(dir, 'README.md'), '# UI Demo\n\nA small visual demo.\n' + 'x'.repeat(240));
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      scripts: { build: 'node -e "console.log(1)"' },
      dependencies: { vue: '^3.0.0' },
    }));
    await fs.writeFile(path.join(dir, 'index.html'), '<div id="app"></div>\n');
    const report: MarketResearchReport = {
      schema_version: 1,
      generated_at: new Date(0).toISOString(),
      project_path: dir,
      domain: 'web_ui_app',
      query: 'production web UI competitors',
      search_provider: 'fixture',
      copy_policy: 'Use competitor material only to extract capabilities; do not copy names, text, UI, code, or brand assets.',
      sources: [{ title: 'UI benchmark', url: 'https://example.com/ui', retrieved_at: new Date(0).toISOString(), snippet: 'Responsive accessible UI.' }],
      capabilities: [{
        id: 'responsive_accessible_ui',
        label: 'Responsive and accessible UI',
        description: 'Keyboard, touch, responsive layout and semantic labels.',
        importance: 'required',
        source_urls: ['https://example.com/ui'],
        local_evidence_patterns: ['aria-', '@media', 'focus-visible'],
      }],
      risks: [],
      confidence: 'medium',
    };
    await writeMarketResearchReport(dir, report);

    const { gap } = await new AnalyzerAgent().fullAnalyze(dir);
    const finding = gap.findings.find((f) => f.category === 'below_market_research_parity');

    expect(finding?.message).toContain('Responsive and accessible UI');
    expect(gap.product_maturity?.references).toContain('https://example.com/ui');
    expect(gap.score.score_gate?.failures.some((f) => f.gate === 'product_maturity')).toBe(true);
  });

  it('flags LLM web demos that require a server-wide API key instead of player-supplied provider config', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-llm-provider-config-gap-'));
    await fs.mkdir(path.join(dir, 'templates'), { recursive: true });
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.mkdir(path.join(dir, '.github', 'workflows'), { recursive: true });
    await fs.writeFile(path.join(dir, 'README.md'), '# LLM Game\n\nDocker gunicorn healthz provider settings.\n' + 'x'.repeat(420));
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask>=3.0.0,<4.0.0\nopenai>=1.0.0,<2.0.0\npytest>=8.0.0,<9.0.0\ngunicorn>=22.0.0,<23.0.0\n');
    await fs.writeFile(path.join(dir, 'constraints.txt'), 'flask>=3.0.0,<4.0.0\nopenai>=1.0.0,<2.0.0\npytest>=8.0.0,<9.0.0\ngunicorn>=22.0.0,<23.0.0\n');
    await fs.writeFile(path.join(dir, 'pyproject.toml'), '[project]\nname = "llm-game"\n');
    await fs.writeFile(path.join(dir, 'Dockerfile'), 'FROM python:3.11-slim\nCMD ["gunicorn", "wsgi:app"]\n');
    await fs.writeFile(path.join(dir, 'wsgi.py'), 'from app import app\n');
    await fs.writeFile(path.join(dir, '.github', 'workflows', 'ci.yml'), 'name: CI\njobs:\n  test:\n    steps:\n      - run: python3 -m pytest -q\n');
    await fs.writeFile(path.join(dir, 'config.py'), [
      'import os',
      'def require_api_key():',
      '    if os.environ.get("DEEPSEEK_API_KEY") or os.environ.get("OPENAI_API_KEY"):',
      '        return True, ""',
      '    return False, "missing global key"',
      'def max_active_games():',
      '    return 3',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'player.py'), [
      'import os',
      'from openai import OpenAI',
      'MODEL = os.environ.get("WW_MODEL", "deepseek-v4-flash")',
      'BASE_URL = os.environ.get("WW_BASE_URL", "https://api.deepseek.com")',
      'def make_client():',
      '    return OpenAI(api_key=os.environ.get("DEEPSEEK_API_KEY") or os.environ.get("OPENAI_API_KEY"), base_url=BASE_URL)',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'app.py'), [
      'import queue, threading, time, uuid',
      'from flask import Flask, jsonify, request, render_template',
      'from config import require_api_key, max_active_games',
      'from player import MODEL, BASE_URL',
      'app = Flask(__name__)',
      '@app.after_request',
      'def headers(response):',
      '    response.headers.setdefault("X-Content-Type-Options", "nosniff")',
      '    response.headers.setdefault("X-Frame-Options", "DENY")',
      '    response.headers.setdefault("Referrer-Policy", "no-referrer")',
      '    return response',
      '@app.route("/")',
      'def index():',
      '    return render_template("index.html")',
      '@app.route("/healthz")',
      'def healthz():',
      '    return jsonify({"status": "ok"})',
      '@app.route("/config")',
      'def config():',
      '    return jsonify({"model": MODEL, "base_url": BASE_URL})',
      '@app.route("/start", methods=["POST"])',
      'def start():',
      '    has_key, error_msg = require_api_key()',
      '    if not has_key:',
      '        return jsonify({"error": error_msg}), 400',
      '    body = request.get_json(silent=True) or {}',
      '    mode = body.get("mode", "m6")',
      '    if mode not in {"m6"}:',
      '        return jsonify({"error": "invalid_mode"}), 400',
      '    speed = max(0.1, min(float(body.get("speed", 1.0)), 3.0))',
      '    return jsonify({"game_id": uuid.uuid4().hex[:8], "mode": mode, "speed": speed})',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'templates', 'index.html'), [
      '<button id="start">start</button>',
      '<select id="speedSelect"><option value="1">1x</option></select>',
      '<script>',
      'document.getElementById("start").addEventListener("click", async () => {',
      '  await fetch("/start", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({mode:"m6", speed:1})});',
      '});',
      '</script>',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'tests', 'test_app.py'), [
      'def test_healthz():',
      '    from app import app',
      '    app.config.update(TESTING=True)',
      '    response = app.test_client().get("/healthz")',
      '    assert response.status_code == 200',
      '',
    ].join('\n'));

    const { gap } = await new AnalyzerAgent().fullAnalyze(dir);
    const categories = gap.findings.map((f) => f.category);

    expect(categories).toContain('missing_user_llm_provider_config');
  });

  it('flags API projects without a contract/runtime harness', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-api-contract-gap-'));
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'README.md'), '# API Demo\n\nExpress API demo.\n' + 'x'.repeat(420));
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      name: 'api-demo',
      scripts: {
        test: 'node --test tests/smoke.test.mjs',
        build: 'node --check src/server.js',
      },
      dependencies: {
        express: '^5.0.0',
      },
    }, null, 2));
    await fs.writeFile(path.join(dir, 'src', 'server.js'), [
      'import express from "express";',
      'const app = express();',
      'app.get("/healthz", (_req, res) => res.json({ ok: true }));',
      'export default app;',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'tests', 'smoke.test.mjs'), 'import test from "node:test"; test("ok", () => {});\n');

    const { gap } = await new AnalyzerAgent().fullAnalyze(dir);
    expect(gap.findings.map((f) => f.category)).toContain('missing_api_contract_harness');
  });

  it('lets the analyzer audit suppress unsupported agent misjudgments before planning', async () => {
    const snapshot = {
      project_path: '/tmp/not-cli',
      detected_language: 'python',
      detected_frameworks: [],
      package_manager: 'pip',
      test_commands: ['python3 -m pytest -q'],
      build_commands: ['python3 -m py_compile main.py'],
      start_commands: ['python3 main.py'],
      important_files: ['main.py'],
      missing_files: [],
      dependency_summary: { runtime: 0, dev: 0, has_lockfile: false },
      timestamp: new Date(0).toISOString(),
    } satisfies ProjectSnapshot;
    const audits = auditAgentMisjudgments({
      snapshot,
      files: ['main.py', 'README.md'],
      pkg: null,
      scripts: {},
      projectSurfaceText: 'print("not a cli")',
      readme: 'plain script',
      findings: [{
        id: 'gap-wrong-cli',
        category: 'missing_cli_contract_harness',
        severity: 'medium',
        message: 'CLI project lacks a contract',
        why_it_matters: '',
        suggested_fix: '',
        related_files: ['scripts/cli-contract-check.mjs'],
      }],
    });

    expect(audits).toHaveLength(1);
    expect(audits[0]?.action).toBe('suppress_finding');
    expect(audits[0]?.finding_category).toBe('missing_cli_contract_harness');
    expect(audits[0]?.reason).toContain('CLI harness finding lacked');
  });

  it('flags env-based projects without a config contract harness', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-config-contract-gap-'));
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'README.md'), '# Config Demo\n\nUses env vars.\n' + 'x'.repeat(420));
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      name: 'config-demo',
      scripts: {
        test: 'node --test tests/smoke.test.mjs',
        build: 'node --check src/app.js',
      },
    }, null, 2));
    await fs.writeFile(path.join(dir, 'src', 'app.js'), 'export const token = process.env.SERVICE_TOKEN || "";\n');
    await fs.writeFile(path.join(dir, 'tests', 'smoke.test.mjs'), 'import test from "node:test"; test("ok", () => {});\n');

    const { gap } = await new AnalyzerAgent().fullAnalyze(dir);
    expect(gap.findings.map((f) => f.category)).toContain('missing_config_contract_harness');
  });

  it('flags data and worker projects without dedicated contract harnesses', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-data-worker-gap-'));
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'README.md'), '# Worker Data Demo\n\nUses a queue and persistence.\n' + 'x'.repeat(420));
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      name: 'data-worker-demo',
      scripts: {
        test: 'node --test tests/smoke.test.mjs',
        build: 'node --check src/worker.js',
      },
      dependencies: {
        bullmq: '^5.0.0',
        prisma: '^6.0.0',
      },
    }, null, 2));
    await fs.writeFile(path.join(dir, 'src', 'worker.js'), [
      'import { Queue } from "bullmq";',
      'export const queue = new Queue("jobs");',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'tests', 'smoke.test.mjs'), 'import test from "node:test"; test("ok", () => {});\n');

    const { gap } = await new AnalyzerAgent().fullAnalyze(dir);
    const categories = gap.findings.map((f) => f.category);
    expect(categories).toContain('missing_data_migration_harness');
    expect(categories).toContain('missing_worker_contract_harness');
  });
});
