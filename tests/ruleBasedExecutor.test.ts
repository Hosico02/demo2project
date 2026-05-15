import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { RuleBasedExecutor } from '../src/agents/providers/RuleBasedExecutor.js';
import { SupervisorAgent } from '../src/agents/SupervisorAgent.js';
import { AnalyzerAgent } from '../src/agents/AnalyzerAgent.js';

async function tmpDemo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-'));
  await fs.writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'rbe-demo', main: 'app.js' }, null, 2),
  );
  await fs.writeFile(path.join(dir, 'app.js'), 'console.log("hi");\n');
  return dir;
}

function socialBackboneFixture(body: string): string {
  return `${body}\n`;
}

describe('RuleBasedExecutor', () => {
  it('writes a real README when the task targets README.md', async () => {
    const demo = await tmpDemo();
    const exec = new RuleBasedExecutor();
    const result = await exec.runTask(
      {
        id: 't1',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Author or extend README.md',
        description: 'Missing README',
        acceptance_criteria: ['README exists'],
        expected_changed_files: ['README.md'],
        verification_commands: ['test -s README.md'],
        priority: 'high',
        status: 'pending',
      },
      { project_path: demo, iteration_id: 'iter1', recent_events: [] },
    );
    expect(result.status).toBe('completed');
    expect(result.changed_files).toContain('README.md');
    const txt = await fs.readFile(path.join(demo, 'README.md'), 'utf8');
    expect(txt.length).toBeGreaterThan(200);
    expect(txt).toContain('## Install');
  });

  it('skips with unable_to_verify_reason when no rule matches', async () => {
    const demo = await tmpDemo();
    const exec = new RuleBasedExecutor();
    const result = await exec.runTask(
      {
        id: 't2',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Refactor the whole codebase',
        description: 'Unscoped',
        acceptance_criteria: [],
        expected_changed_files: ['(see suggested_fix)'],
        verification_commands: [],
        priority: 'low',
        status: 'pending',
      },
      { project_path: demo, iteration_id: 'iter1', recent_events: [] },
    );
    expect(result.status).toBe('skipped');
    expect(result.unable_to_verify_reason).toBe('no_rule_for_task');
  });

  it('actually moves the project score up after one iteration', async () => {
    const demo = await tmpDemo();
    const sup = new SupervisorAgent();
    const summaries = await sup.iterate({
      projectPath: demo,
      goal: 'project-ready',
      provider: new RuleBasedExecutor(),
      maxIterations: 1,
    });
    const s = summaries[0]!;
    expect(s.project_score_after.total).toBeGreaterThanOrEqual(s.project_score_before.total);
    expect(s.changed_files.length).toBeGreaterThan(0);
  });

  it('writes pytest-compatible smoke tests for Python projects', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-py-'));
    await fs.writeFile(path.join(dir, 'app.py'), 'print("hi")\n');
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask>=3.0.0\n');
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      scripts: {
        test: 'node --test tests',
        build: 'node -e "console.log(\'build ok\')"',
      },
    }));
    const exec = new RuleBasedExecutor();
    const result = await exec.runTask(
      {
        id: 'py1',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Add Python smoke tests',
        description: 'No Python tests found',
        acceptance_criteria: ['pytest exits 0'],
        expected_changed_files: ['tests/test_smoke.py', 'requirements.txt', 'package.json'],
        verification_commands: ['python3 -m pytest -q'],
        priority: 'high',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    expect(result.changed_files).toContain('tests/test_smoke.py');
    const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
    expect(pkg.scripts.test).toBe('python3 -m pytest -q');
    expect(pkg.scripts.build).toContain('ast.parse');
  });

  it('writes pytest-compatible smoke tests for single-file Python demos', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-py-demo-'));
    await fs.writeFile(path.join(dir, 'demo.py'), 'print("hi")\n');
    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'py-demo',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Add Python smoke tests',
        description: 'No Python tests found',
        acceptance_criteria: ['pytest exits 0'],
        expected_changed_files: ['tests/test_smoke.py', 'requirements.txt', 'package.json'],
        verification_commands: ['python3 -m pytest -q'],
        priority: 'high',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    const test = await fs.readFile(path.join(dir, 'tests', 'test_smoke.py'), 'utf8');
    expect(test).toContain('"demo.py"');
    const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
    expect(pkg.scripts.build).toContain('demo.py');
  });

  it('writes JavaScript smoke tests with a concrete node test target', async () => {
    const dir = await tmpDemo();
    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'js-smoke',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Add test suite',
        description: 'No tests found',
        acceptance_criteria: ['npm test exits 0'],
        expected_changed_files: ['tests/smoke.test.mjs', 'package.json'],
        verification_commands: ['npm test'],
        priority: 'high',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    expect(result.changed_files).toContain('tests/smoke.test.mjs');
    const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
    expect(pkg.scripts.test).toBe('node --test tests/smoke.test.mjs');
  });

  it('writes static public assets for frontend app delivery', async () => {
    const dir = await tmpDemo();
    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'public-assets',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Address gap: missing_recommended_file (public)',
        description: 'Missing recommended file/dir: public',
        acceptance_criteria: ['public assets exist'],
        expected_changed_files: ['public'],
        verification_commands: ['test -s public/robots.txt', 'test -s public/site.webmanifest'],
        priority: 'medium',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    expect(result.changed_files).toContain('public/robots.txt');
    expect(result.changed_files).toContain('public/site.webmanifest');
    const manifest = JSON.parse(await fs.readFile(path.join(dir, 'public', 'site.webmanifest'), 'utf8'));
    expect(manifest.start_url).toBe('/');
  });

  it('adds a single-file demo intake/runtime contract harness', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-single-file-'));
    await fs.writeFile(path.join(dir, 'demo.py'), [
      'def main():',
      '    print("hello demo")',
      '',
      'if __name__ == "__main__":',
      '    main()',
      '',
    ].join('\n'));

    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'single-file',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Add single-file demo intake harness',
        description: 'Single-file demo lacks intake/runtime contract harness',
        acceptance_criteria: ['demo intake doc exists', 'runtime check exits 0'],
        expected_changed_files: ['scripts/demo-runtime-check.mjs', 'docs/demo-intake.md', 'package.json'],
        verification_commands: ['node scripts/demo-runtime-check.mjs'],
        priority: 'high',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    expect(result.changed_files).toContain('scripts/demo-runtime-check.mjs');
    expect(result.changed_files).toContain('docs/demo-intake.md');
    expect(result.changed_files).toContain('package.json');
    const script = await fs.readFile(path.join(dir, 'scripts', 'demo-runtime-check.mjs'), 'utf8');
    expect(script).toContain('py_compile');
    expect(script).toContain('demo.py');
    const doc = await fs.readFile(path.join(dir, 'docs', 'demo-intake.md'), 'utf8');
    expect(doc).toContain('demo.py');
    const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
    expect(pkg.scripts['demo:intake-check']).toBe('node scripts/demo-runtime-check.mjs');
  });

  it('adds a CLI executable contract harness', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-cli-contract-'));
    await fs.mkdir(path.join(dir, 'bin'), { recursive: true });
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      name: 'cli-demo',
      bin: './bin/cli.js',
      scripts: { build: 'node --check bin/cli.js' },
    }, null, 2));
    await fs.writeFile(path.join(dir, 'bin', 'cli.js'), '#!/usr/bin/env node\nif (process.argv.includes("--help")) console.log("Usage: cli-demo");\n');

    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'cli-contract',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Add CLI executable contract harness',
        description: 'CLI project lacks executable contract harness',
        acceptance_criteria: ['cli --help exits successfully'],
        expected_changed_files: ['scripts/cli-contract-check.mjs', 'docs/cli-contract.md', 'package.json'],
        verification_commands: ['node scripts/cli-contract-check.mjs'],
        priority: 'medium',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    expect(result.changed_files).toContain('scripts/cli-contract-check.mjs');
    expect(result.changed_files).toContain('docs/cli-contract.md');
    const script = await fs.readFile(path.join(dir, 'scripts', 'cli-contract-check.mjs'), 'utf8');
    expect(script).toContain('--help');
    expect(script).toContain('bin/cli.js');
    const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
    expect(pkg.scripts['cli:contract-check']).toBe('node scripts/cli-contract-check.mjs');
  });

  it('implements a tested product core spine and wires CLI entrypoints to it', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-product-core-'));
    await fs.mkdir(path.join(dir, 'bin'), { recursive: true });
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      name: 'cli-demo',
      type: 'module',
      bin: './bin/cli.js',
      scripts: { test: 'node --test tests/smoke.test.mjs' },
    }, null, 2));
    await fs.writeFile(path.join(dir, 'bin', 'cli.js'), '#!/usr/bin/env node\nif (process.argv.includes("--help")) console.log("Usage: cli-demo");\n');

    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'product-core',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Implement product core spine',
        description: 'Productization only added a shell, not executable product behavior',
        acceptance_criteria: ['product core has executable tests', 'CLI entry uses product core'],
        expected_changed_files: ['src/product-core.mjs', 'tests/product-core.test.mjs', 'docs/product-core.md', 'bin/cli.js', 'package.json'],
        verification_commands: ['node --test tests/product-core.test.mjs'],
        priority: 'high',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    expect(result.changed_files).toContain('src/product-core.mjs');
    expect(result.changed_files).toContain('tests/product-core.test.mjs');
    expect(result.changed_files).toContain('docs/product-core.md');
    expect(result.changed_files).toContain('bin/cli.js');
    const core = await fs.readFile(path.join(dir, 'src', 'product-core.mjs'), 'utf8');
    expect(core).toContain('createProductCore');
    expect(core).toContain('runWorkflow');
    const cli = await fs.readFile(path.join(dir, 'bin', 'cli.js'), 'utf8');
    expect(cli).toContain('createProductCore');
    expect(cli).toContain('runWorkflow');
    const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
    expect(pkg.scripts['product:core-check']).toBe('node --test tests/product-core.test.mjs');
    expect(pkg.scripts.test).toBe('node --test');
    expect(pkg.scripts.build).toContain('src/product-core.mjs');
  });

  it('implements a Python product core spine without adding Node validation to Python projects', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-python-product-core-'));
    await fs.writeFile(path.join(dir, 'app.py'), 'from flask import Flask\napp = Flask(__name__)\n');
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask>=3.0.0\npytest>=8.0.0\n');
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'python-api-demo', scripts: {} }, null, 2));

    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'python-product-core',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Implement product core spine',
        description: 'Productization only added a shell, not executable product behavior',
        acceptance_criteria: ['Python product core has executable tests'],
        expected_changed_files: ['src/product_core.py', 'tests/test_product_core.py', 'docs/product-core.md', 'package.json'],
        verification_commands: ['python3 -m pytest tests/test_product_core.py -q'],
        priority: 'high',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    expect(result.changed_files).toContain('src/product_core.py');
    expect(result.changed_files).toContain('tests/test_product_core.py');
    const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
    expect(pkg.scripts['product:core-check']).toBe('python3 -m pytest tests/test_product_core.py -q');
    expect(pkg.scripts.build).toContain('ast.parse');
    expect(pkg.scripts.build).not.toContain('node --check');
  });

  it('generates Python product core tests that avoid src package import side effects', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-py-product-core-sidefx-'));
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'pytest>=8.0\n');
    await fs.writeFile(path.join(dir, 'app.py'), 'print("demo")\n');
    await fs.writeFile(path.join(dir, 'src', '__init__.py'), 'from . import app\n');

    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'py-core-sidefx',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Implement product core spine',
        description: 'Productization only added shell files',
        acceptance_criteria: ['Python product core test imports without package side effects'],
        expected_changed_files: ['src/product_core.py', 'tests/test_product_core.py', 'docs/product-core.md', 'package.json'],
        verification_commands: ['python3 -m pytest tests/test_product_core.py -q'],
        priority: 'high',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    const test = await fs.readFile(path.join(dir, 'tests', 'test_product_core.py'), 'utf8');
    expect(test).toContain('spec_from_file_location');
    expect(test).not.toContain('from src.product_core import');
  });

  it('writes a Flask deployment scaffold for Python projects', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-flask-deploy-'));
    await fs.writeFile(path.join(dir, 'app.py'), 'from flask import Flask\napp = Flask(__name__)\n');
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask>=3.0.0\n');
    const exec = new RuleBasedExecutor();

    const result = await exec.runTask(
      {
        id: 'deploy1',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Add Flask deployment scaffold',
        description: 'Missing Dockerfile',
        acceptance_criteria: ['Dockerfile exists', 'wsgi.py exposes app', 'gunicorn dependency exists'],
        expected_changed_files: ['Dockerfile', '.dockerignore', 'wsgi.py', 'requirements.txt'],
        verification_commands: [
          'test -f Dockerfile',
          'test -f wsgi.py',
          'python3 -c "from pathlib import Path; assert \'gunicorn\' in Path(\'requirements.txt\').read_text().lower()"',
        ],
        priority: 'medium',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    expect(result.changed_files).toContain('Dockerfile');
    expect(result.changed_files).toContain('wsgi.py');
    const req = await fs.readFile(path.join(dir, 'requirements.txt'), 'utf8');
    expect(req).toContain('gunicorn>=22.0.0');
    const dockerfile = await fs.readFile(path.join(dir, 'Dockerfile'), 'utf8');
    expect(dockerfile).toContain('gunicorn');
    expect(dockerfile).toContain('wsgi:app');
    expect(dockerfile).not.toContain('CMD ["python", "app.py"]');
  });

  it('repairs an existing Flask Dockerfile that starts app.py directly', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-flask-docker-repair-'));
    await fs.writeFile(path.join(dir, 'app.py'), 'from flask import Flask\napp = Flask(__name__)\n');
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask>=3.0.0\ngunicorn>=22.0.0\n');
    await fs.writeFile(path.join(dir, 'constraints.txt'), 'flask>=3.0.0,<4.0.0\n');
    await fs.writeFile(path.join(dir, 'Dockerfile'), [
      'FROM python:3.11-slim',
      'WORKDIR /app',
      'COPY . .',
      'CMD ["python", "app.py"]',
      '',
    ].join('\n'));
    const exec = new RuleBasedExecutor();

    const result = await exec.runTask(
      {
        id: 'deploy-repair',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Add Flask deployment scaffold',
        description: 'Dockerfile starts Flask with a development server',
        acceptance_criteria: ['Dockerfile starts gunicorn instead of app.py'],
        expected_changed_files: ['Dockerfile', 'wsgi.py', 'requirements.txt', 'constraints.txt'],
        verification_commands: [
          'python3 -c "from pathlib import Path; t=Path(\'Dockerfile\').read_text().lower(); assert \'gunicorn\' in t and \'wsgi:app\' in t"',
        ],
        priority: 'high',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    expect(result.changed_files).toContain('Dockerfile');
    expect(result.changed_files).toContain('constraints.txt');
    const dockerfile = await fs.readFile(path.join(dir, 'Dockerfile'), 'utf8');
    expect(dockerfile).toContain('RUN pip install --no-cache-dir -r requirements.txt -c constraints.txt');
    expect(dockerfile).toContain('gunicorn');
    expect(dockerfile).not.toContain('CMD ["python", "app.py"]');
    const constraints = await fs.readFile(path.join(dir, 'constraints.txt'), 'utf8');
    expect(constraints).toContain('gunicorn>=22.0.0,<23.0.0');
  });

  it('adds Flask health and missing-key guard for compatible app.py demos', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-flask-guard-'));
    await fs.writeFile(path.join(dir, 'app.py'), [
      'from flask import Flask, jsonify',
      'app = Flask(__name__)',
      '@app.route("/start", methods=["POST"])',
      'def start_game():',
      '    return jsonify({"game_id": "demo"})',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask>=3.0.0\n');
    const exec = new RuleBasedExecutor();

    const result = await exec.runTask(
      {
        id: 'guard1',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Add Flask health and config guard',
        description: 'Missing health check endpoint',
        acceptance_criteria: ['/healthz returns status', '/start rejects missing API key clearly'],
        expected_changed_files: ['app.py', 'config.py'],
        verification_commands: [
          'python3 -c "from pathlib import Path; t=Path(\'app.py\').read_text(); assert \'/healthz\' in t and \'if not has_api_key()\' in t"',
        ],
        priority: 'high',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    expect(result.changed_files).toContain('app.py');
    expect(result.changed_files).toContain('config.py');
    const app = await fs.readFile(path.join(dir, 'app.py'), 'utf8');
    expect(app).toContain('if not has_api_key()');
    expect(app).toContain('return jsonify(missing_api_key_payload()), 400');
  });

  it('does not add game-only Flask tests or config to generic chat APIs', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-flask-chat-health-'));
    await fs.writeFile(path.join(dir, 'app.py'), [
      'from flask import Flask, jsonify, request',
      'app = Flask(__name__)',
      '@app.get("/")',
      'def index():',
      '    return "ok"',
      '@app.post("/chat")',
      'def chat():',
      '    body = request.get_json(silent=True) or {}',
      '    return jsonify({"reply": body.get("message", "")})',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask>=3.0.0\npytest>=8.0.0\n');

    const exec = new RuleBasedExecutor();
    const result = await exec.runTask(
      {
        id: 'guard-chat',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Add Flask health and config guard',
        description: 'Missing health check endpoint',
        acceptance_criteria: ['/healthz returns status without inventing game routes'],
        expected_changed_files: ['app.py', 'tests/test_app.py'],
        verification_commands: ['python3 -m pytest tests/test_app.py -q'],
        priority: 'high',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    expect(result.changed_files).toContain('app.py');
    expect(result.changed_files).toContain('tests/test_app.py');
    expect(result.changed_files).not.toContain('config.py');

    const app = await fs.readFile(path.join(dir, 'app.py'), 'utf8');
    expect(app).toContain('@app.route("/healthz")');
    expect(app).not.toContain('from config import');
    expect(app).not.toContain('max_active_games');
    expect(app).not.toContain('missing_api_key_payload');

    const tests = await fs.readFile(path.join(dir, 'tests', 'test_app.py'), 'utf8');
    expect(tests).toContain('def test_healthz');
    expect(tests).not.toContain('client.post("/start"');
    expect(tests).not.toContain('client.get("/modes"');
    expect(tests).not.toContain('_games');
  });

  it('does not add start-route regression tests to generic Flask APIs', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-flask-chat-regression-'));
    await fs.writeFile(path.join(dir, 'app.py'), [
      'from flask import Flask, jsonify',
      'app = Flask(__name__)',
      '@app.after_request',
      'def add_security_headers(response):',
      '    response.headers.setdefault("X-Content-Type-Options", "nosniff")',
      '    return response',
      '@app.route("/healthz")',
      'def healthz():',
      '    return jsonify({"ok": True})',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask>=3.0.0\npytest>=8.0.0\n');

    const exec = new RuleBasedExecutor();
    const result = await exec.runTask(
      {
        id: 'reg-chat',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Add Flask regression tests',
        description: 'Missing Flask regression tests',
        acceptance_criteria: ['Regression tests match detected API routes'],
        expected_changed_files: ['tests/test_regression.py'],
        verification_commands: ['python3 -m pytest tests/test_regression.py -q'],
        priority: 'high',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    const tests = await fs.readFile(path.join(dir, 'tests', 'test_regression.py'), 'utf8');
    expect(tests).toContain('test_regression_health_endpoint_keeps_security_headers');
    expect(tests).not.toContain('client.post("/start"');
    expect(tests).not.toContain('invalid_mode');
    expect(tests).not.toContain('_games');
  });

  it('appends public deployment docs to an existing substantive README', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-deploy-docs-'));
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'deploy-docs-demo' }, null, 2));
    await fs.writeFile(path.join(dir, 'README.md'), [
      '# Demo',
      '',
      'This README already explains the local prototype usage in enough detail that it should not be replaced.',
      '',
      '## Local development',
      '',
      'Run the Flask app locally while iterating on prompt behavior.',
      '',
      '## Notes',
      '',
      'The current file intentionally has many words but no production deployment instructions. '.repeat(8),
      '',
    ].join('\n'));

    const exec = new RuleBasedExecutor();
    const result = await exec.runTask(
      {
        id: 'docs1',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Document public demo deployment',
        description: 'Missing production deployment docs for Docker, gunicorn and health checks',
        acceptance_criteria: ['README documents Docker/gunicorn startup and health check'],
        expected_changed_files: ['README.md'],
        verification_commands: [
          'python3 -c "from pathlib import Path; t=Path(\'README.md\').read_text(); assert \'Docker\' in t and \'gunicorn\' in t and \'healthz\' in t"',
        ],
        priority: 'medium',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    expect(result.changed_files).toContain('README.md');
    const readme = await fs.readFile(path.join(dir, 'README.md'), 'utf8');
    expect(readme).toContain('Public Demo Deployment');
    expect(readme).toContain('gunicorn');
    expect(readme).toContain('Docker');
    expect(readme).toContain('healthz');
  });

  it('adds future annotations to Python sources that use Python 3.10 style unions', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-py-annotations-'));
    await fs.writeFile(path.join(dir, 'app.py'), [
      'from flask import Flask, jsonify',
      'import prompts',
      'app = Flask(__name__)',
      '@app.route("/start", methods=["POST"])',
      'def start_game():',
      '    return jsonify({"game_id": "demo"})',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'prompts.py'), [
      'def build_prompt(personality: dict | None = None):',
      '    return personality or {}',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask>=3.0.0\n');

    const exec = new RuleBasedExecutor();
    const result = await exec.runTask(
      {
        id: 'guard2',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Add Flask health and config guard',
        description: 'Missing health check endpoint',
        acceptance_criteria: ['Python sources import on Python 3.9 compatible runtimes'],
        expected_changed_files: ['app.py', 'config.py'],
        verification_commands: [
          'python3 -c "from pathlib import Path; assert Path(\'prompts.py\').read_text().startswith(\'from __future__ import annotations\')"',
        ],
        priority: 'high',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    expect(result.changed_files).toContain('prompts.py');
    const prompts = await fs.readFile(path.join(dir, 'prompts.py'), 'utf8');
    expect(prompts).toMatch(/^from __future__ import annotations/);
  });

  it('repairs Python verification failures caused by runtime annotation compatibility', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-py-annotation-repair-'));
    await fs.writeFile(path.join(dir, 'app.py'), 'import prompts\n');
    await fs.writeFile(path.join(dir, 'prompts.py'), [
      'def build_prompt(personality: dict | None = None):',
      '    return personality or {}',
      '',
    ].join('\n'));

    const exec = new RuleBasedExecutor();
    const result = await exec.runTask(
      {
        id: 'repair-annotations',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Repair failing project verification',
        description: 'pytest failed with TypeError: unsupported operand type(s) for |: type and NoneType while importing prompts.py',
        acceptance_criteria: ['Python sources import on Python 3.9 compatible runtimes'],
        expected_changed_files: ['prompts.py'],
        verification_commands: [
          'python3 -c "import prompts; assert prompts.build_prompt() == {}"',
        ],
        priority: 'blocker',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    expect(result.summary).toContain('annotation compatibility');
    expect(result.changed_files).toContain('prompts.py');
  });

  it('hardens Flask public runtime controls and API tests', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-flask-runtime-'));
    await fs.writeFile(path.join(dir, 'app.py'), [
      'import queue',
      'import threading',
      'import time',
      'import uuid',
      'from flask import Flask, jsonify, request',
      'from config import require_api_key',
      'GAME_MODES = {"m6": {"name": "six"}}',
      'DEFAULT_MODE = "m6"',
      '_games = {}',
      '_lock = threading.Lock()',
      'app = Flask(__name__)',
      '@app.route("/healthz")',
      'def healthz():',
      '    return jsonify({"status": "ok"})',
      '@app.route("/start", methods=["POST"])',
      'def start_game():',
      '    has_key, error_msg = require_api_key()',
      '    if not has_key:',
      '        return jsonify({"error": error_msg}), 400',
      '    body = request.get_json(silent=True) or {}',
      '    mode = body.get("mode", DEFAULT_MODE)',
      '    speed = body.get("speed", 1.0)',
      '    try:',
      '        speed = float(speed)',
      '    except (TypeError, ValueError):',
      '        speed = 1.0',
      '    game_id = uuid.uuid4().hex[:8]',
      '    q: queue.Queue = queue.Queue()',
      '    with _lock:',
      '        _games[game_id] = {"queue": q, "last_seen": time.time()}',
      '    return jsonify({"game_id": game_id, "mode": mode, "speed": speed})',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'config.py'), [
      'def require_api_key():',
      '    return True, ""',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask>=3.0.0\npytest>=8.0\n');
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'tests', 'test_app.py'), [
      'import pytest',
      '',
      '',
      '@pytest.fixture()',
      'def client():',
      '    from app import app',
      '    app.config.update(TESTING=True)',
      '    with app.test_client() as client:',
      '        yield client',
      '',
      '',
      'def test_start_with_invalid_mode_still_returns_game_id(client):',
      '    response = client.post("/start", json={"mode": "invalid_mode"})',
      '    assert response.status_code == 200',
      '    assert "game_id" in response.get_json()',
      '',
    ].join('\n'));

    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'runtime1',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Harden Flask public runtime controls',
        description: 'Missing industrial public runtime controls',
        acceptance_criteria: ['security headers', 'invalid input rejected', 'active game limit'],
        expected_changed_files: ['app.py', 'config.py', 'tests/test_app.py'],
        verification_commands: ['python3 -m pytest tests/test_app.py -q'],
        priority: 'high',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    expect(result.changed_files).toContain('app.py');
    expect(result.changed_files).toContain('config.py');
    expect(result.changed_files).toContain('tests/test_app.py');
    const app = await fs.readFile(path.join(dir, 'app.py'), 'utf8');
    expect(app).toContain('X-Content-Type-Options');
    expect(app).toContain('invalid_mode');
    expect(app).toContain('too_many_active_games');
    expect(app).toContain('logger = logging.getLogger(__name__)');
    const tests = await fs.readFile(path.join(dir, 'tests', 'test_app.py'), 'utf8');
    expect(tests).toContain('def test_start_with_invalid_mode_still_returns_game_id(client, monkeypatch):');
    expect(tests).toMatch(/test_start_with_invalid_mode_still_returns_game_id[\s\S]*monkeypatch\.setenv\("DEEPSEEK_API_KEY", "test-key"\)/);
    expect(tests).not.toContain('lambda: 0');
    expect(tests).toContain('monkeypatch.setenv("MAX_ACTIVE_GAMES", "1")');
    expect(tests).toContain('app_module._games["existing"]');
  });

  it('keeps generated Flask config compatible across guard and runtime hardening phases', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-flask-guard-runtime-'));
    await fs.writeFile(path.join(dir, 'app.py'), [
      'import queue',
      'import threading',
      'import time',
      'import uuid',
      'from flask import Flask, jsonify, request',
      'GAME_MODES = {"m6": {"name": "six"}}',
      'DEFAULT_MODE = "m6"',
      '_games = {}',
      '_lock = threading.Lock()',
      'app = Flask(__name__)',
      '@app.route("/start", methods=["POST"])',
      'def start_game():',
      '    body = request.get_json(silent=True) or {}',
      '    mode = body.get("mode", DEFAULT_MODE)',
      '    speed = body.get("speed", 1.0)',
      '    try:',
      '        speed = float(speed)',
      '    except (TypeError, ValueError):',
      '        speed = 1.0',
      '    game_id = uuid.uuid4().hex[:8]',
      '    q = queue.Queue()',
      '    with _lock:',
      '        _games[game_id] = {"queue": q, "last_seen": time.time()}',
      '    return jsonify({"game_id": game_id, "mode": mode, "speed": speed})',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask>=3.0.0\npytest>=8.0\n');

    const exec = new RuleBasedExecutor();
    const guard = await exec.runTask(
      {
        id: 'guard-runtime-1',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Add Flask health and config guard',
        description: 'Missing health check endpoint and config guard',
        acceptance_criteria: ['guard is generated'],
        expected_changed_files: ['app.py', 'config.py', 'tests/test_app.py'],
        verification_commands: ['python3 -m pytest tests/test_app.py -q'],
        priority: 'high',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );
    const harden = await exec.runTask(
      {
        id: 'guard-runtime-2',
        iteration_id: 'iter2',
        assigned_to: 'executor',
        title: 'Harden Flask public runtime controls',
        description: 'Missing industrial public runtime controls',
        acceptance_criteria: ['runtime controls remain import-compatible'],
        expected_changed_files: ['app.py', 'config.py', 'tests/test_app.py'],
        verification_commands: ['python3 -m pytest tests/test_app.py -q'],
        priority: 'high',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter2', recent_events: [] },
    );

    expect(guard.status).toBe('completed');
    expect(harden.status).toBe('completed');
    const config = await fs.readFile(path.join(dir, 'config.py'), 'utf8');
    expect(config).toContain('def require_api_key()');
  });

  it('repairs generated Flask verification failures by refreshing industrial tests', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-flask-repair-'));
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'app.py'), [
      'import logging',
      'import queue',
      'import threading',
      'import time',
      'import uuid',
      'from flask import Flask, jsonify, request',
      'from config import require_api_key, max_active_games',
      'GAME_MODES = {"m6": {"name": "six"}}',
      'DEFAULT_MODE = "m6"',
      '_games = {}',
      '_lock = threading.Lock()',
      'app = Flask(__name__)',
      'logger = logging.getLogger(__name__)',
      '@app.after_request',
      'def add_security_headers(response):',
      '    response.headers.setdefault("X-Content-Type-Options", "nosniff")',
      '    response.headers.setdefault("X-Frame-Options", "DENY")',
      '    response.headers.setdefault("Referrer-Policy", "no-referrer")',
      '    return response',
      '@app.route("/healthz")',
      'def healthz():',
      '    return jsonify({"status": "ok"})',
      '@app.route("/start", methods=["POST"])',
      'def start_game():',
      '    has_key, error_msg = require_api_key()',
      '    if not has_key:',
      '        return jsonify({"error": error_msg}), 400',
      '    body = request.get_json(silent=True) or {}',
      '    mode = body.get("mode", DEFAULT_MODE)',
      '    if mode not in GAME_MODES:',
      '        return jsonify({"error": "invalid_mode"}), 400',
      '    speed = max(0.1, min(float(body.get("speed", 1.0)), 3.0))',
      '    game_id = uuid.uuid4().hex[:8]',
      '    q = queue.Queue()',
      '    with _lock:',
      '        if len(_games) >= max_active_games():',
      '            return jsonify({"error": "too_many_active_games"}), 429',
      '        _games[game_id] = {"queue": q, "last_seen": time.time()}',
      '    logger.info("game started", extra={"game_id": game_id})',
      '    return jsonify({"game_id": game_id, "mode": mode, "speed": speed})',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'config.py'), [
      'import os',
      '',
      'def require_api_key():',
      '    return bool(os.environ.get("DEEPSEEK_API_KEY")), ""',
      '',
      'def max_active_games():',
      '    return max(1, int(os.environ.get("MAX_ACTIVE_GAMES", "3")))',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask>=3.0.0\npytest>=8.0\n');
    await fs.writeFile(path.join(dir, 'tests', 'test_app.py'), [
      'import pytest',
      '',
      '@pytest.fixture()',
      'def client():',
      '    from app import app',
      '    app.config.update(TESTING=True)',
      '    with app.test_client() as client:',
      '        yield client',
      '',
      'def test_start_with_invalid_mode_still_returns_game_id(client):',
      '    response = client.post("/start", json={"mode": "invalid_mode"})',
      '    assert response.status_code == 400',
      '    assert response.get_json()["error"] == "invalid_mode"',
      '',
      'def test_start_rejects_when_active_game_limit_reached(client, monkeypatch):',
      '    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")',
      '    import app as app_module',
      '    monkeypatch.setattr(app_module, "max_active_games", lambda: 0)',
      '    response = client.post("/start", json={"mode": "m6"})',
      '    assert response.status_code == 429',
      '',
    ].join('\n'));

    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'repair1',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Repair failed verification: python3 -m pytest tests/test_app.py -q',
        description: 'Test verification failed',
        acceptance_criteria: ['test command exits 0'],
        expected_changed_files: ['app.py', 'config.py', 'tests/test_app.py'],
        verification_commands: ['python3 -m pytest tests/test_app.py -q'],
        priority: 'blocker',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    const tests = await fs.readFile(path.join(dir, 'tests', 'test_app.py'), 'utf8');
    expect(tests).toContain('def test_start_with_invalid_mode_still_returns_game_id(client, monkeypatch):');
    expect(tests).not.toContain('lambda: 0');
  });

  it('repairs over-specified Python smoke tests generated from hallucinated source expectations', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-python-smoke-overspecified-'));
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'game.py'), 'MODES = ["m6", "m8", "m9", "m10", "m11"]\n');
    await fs.writeFile(path.join(dir, 'app.py'), [
      'from flask import Flask',
      'app = Flask(__name__)',
      '',
      '@app.route("/stream/<game_id>")',
      'def stream(game_id):',
      '    return game_id',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'tests', 'test_smoke.py'), [
      'from pathlib import Path',
      '',
      'def test_five_modes_in_source():',
      '    text = Path("game.py").read_text()',
      '    for mode in ["m6", "m7", "m8", "m9", "m10", "m11"]:',
      '        assert mode in text, f"Mode {mode} not found"',
      '',
      'def test_required_routes_defined():',
      '    text = Path("app.py").read_text()',
      '    required_routes = ["/start", "/stream"]',
      '    for route in required_routes:',
      '        assert route in text, f"Route {route} not found"',
      '',
    ].join('\n'));

    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'repair-smoke',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Repair failed verification: python3 -m pytest -q',
        description: 'tests/test_smoke.py invented m7 and exact /stream route expectations not present in source',
        acceptance_criteria: ['replace brittle smoke tests with source-safe compile checks'],
        expected_changed_files: ['tests/test_smoke.py'],
        verification_commands: ['python3 -m pytest -q'],
        priority: 'blocker',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    expect(result.changed_files).toEqual(['tests/test_smoke.py']);
    const smoke = await fs.readFile(path.join(dir, 'tests', 'test_smoke.py'), 'utf8');
    expect(smoke).toContain('ast.parse');
    expect(smoke).not.toContain('m7');
    expect(smoke).not.toContain('required_routes');
  });

  it('repairs secret redaction source behavior without rewriting tests', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-secret-redaction-'));
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'app.py'), [
      'import re',
      '',
      'def _redact_secrets(text: str) -> str:',
      '    return re.sub(r"AKIA[0-9A-Za-z]{16}", "[AWS_KEY_REDACTED]", text)',
      '',
    ].join('\n'));
    const testBody = [
      'def test_redact_secrets_function():',
      '    from app import _redact_secrets',
      '    assert _redact_secrets("AKIAJLRMXVBXYZABCD") == "[AWS_KEY_REDACTED]"',
      '',
    ].join('\n');
    await fs.writeFile(path.join(dir, 'tests', 'test_app.py'), testBody);

    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'repair-secret',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Repair failed verification: python3 -m pytest tests/test_app.py -q',
        description: 'test_redact_secrets_function failed for app._redact_secrets',
        acceptance_criteria: ['the root cause is fixed in source, not tests'],
        expected_changed_files: ['app.py', 'tests/test_app.py'],
        verification_commands: ['python3 -m pytest tests/test_app.py -q'],
        priority: 'blocker',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    expect(result.changed_files).toEqual(['app.py']);
    expect(await fs.readFile(path.join(dir, 'tests', 'test_app.py'), 'utf8')).toBe(testBody);
  });

  it('replaces no-op lint scripts when aligning Python package scripts', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-python-scripts-'));
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      name: 'py-app',
      scripts: {
        test: 'echo ok',
        build: 'echo ok',
        lint: 'echo "No lint step configured"',
      },
    }));
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'pytest>=8\n');
    await fs.writeFile(path.join(dir, 'app.py'), 'print("ok")\n');

    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'scripts',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Align package scripts with Python project',
        description: 'Node package scripts are misaligned with the Python project',
        acceptance_criteria: ['package scripts validate Python sources'],
        expected_changed_files: ['package.json'],
        verification_commands: [],
        priority: 'medium',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.changed_files).toContain('package.json');
    const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
    expect(pkg.scripts.lint).toContain('python3 -c');
    expect(pkg.scripts.lint).not.toContain('echo');
  });

  it('adds Python dependency constraints and install docs', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-python-deps-'));
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'README.md'), '# Demo\n\n## Install\n\npip install -r requirements.txt\n');
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask\nopenai>=1.0.0\npytest>=8.0.0\n');
    await fs.writeFile(path.join(dir, 'tests', 'test_smoke.py'), 'def test_smoke():\n    assert True\n');

    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'deps1',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Add Python dependency constraints',
        description: 'Missing Python dependency constraints',
        acceptance_criteria: ['constraints.txt bounds direct dependencies'],
        expected_changed_files: ['requirements.txt', 'constraints.txt', 'README.md'],
        verification_commands: [
          'python3 -c "from pathlib import Path; t=Path(\'constraints.txt\').read_text(); assert \'flask\' in t and \'<\' in t"',
          'python3 -m pytest -q',
        ],
        priority: 'high',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    expect(result.changed_files).toContain('constraints.txt');
    expect(result.changed_files).toContain('README.md');
    const constraints = await fs.readFile(path.join(dir, 'constraints.txt'), 'utf8');
    expect(constraints).toContain('flask>=3.0.0,<4.0.0');
    expect(constraints).toContain('openai>=1.0.0,<2.0.0');
    const readme = await fs.readFile(path.join(dir, 'README.md'), 'utf8');
    expect(readme).toContain('-c constraints.txt');
  });

  it('adds Flask regression tests and operational docs', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-flask-maturity-'));
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'app.py'), [
      'from flask import Flask, jsonify, request',
      'from config import require_api_key',
      'GAME_MODES = {"m6": {"name": "six"}}',
      'DEFAULT_MODE = "m6"',
      'app = Flask(__name__)',
      '@app.after_request',
      'def add_security_headers(response):',
      '    response.headers.setdefault("X-Content-Type-Options", "nosniff")',
      '    return response',
      '@app.route("/healthz")',
      'def healthz():',
      '    return jsonify({"status": "ok"})',
      '@app.route("/start", methods=["POST"])',
      'def start_game():',
      '    has_key, error_msg = require_api_key()',
      '    if not has_key:',
      '        return jsonify({"error": error_msg}), 400',
      '    body = request.get_json(silent=True) or {}',
      '    if body.get("mode", DEFAULT_MODE) not in GAME_MODES:',
      '        return jsonify({"error": "invalid_mode"}), 400',
      '    return jsonify({"game_id": "demo"})',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'config.py'), 'def require_api_key():\n    return True, ""\n');
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask>=3.0.0\npytest>=8.0.0\n');

    const regression = await new RuleBasedExecutor().runTask(
      {
        id: 'reg1',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Add Flask regression tests',
        description: 'Missing regression tests',
        acceptance_criteria: ['regression tests exist'],
        expected_changed_files: ['tests/test_regression.py'],
        verification_commands: ['python3 -m pytest tests/test_regression.py -q'],
        priority: 'high',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );
    const docs = await new RuleBasedExecutor().runTask(
      {
        id: 'docs1',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Add operational documentation',
        description: 'Missing operational docs',
        acceptance_criteria: ['architecture and operations docs exist'],
        expected_changed_files: ['docs/architecture.md', 'docs/operations.md'],
        verification_commands: ['test -s docs/architecture.md', 'test -s docs/operations.md'],
        priority: 'medium',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(regression.status).toBe('completed');
    expect(regression.changed_files).toContain('tests/test_regression.py');
    expect(docs.status).toBe('completed');
    expect(docs.changed_files).toContain('docs/architecture.md');
    expect(docs.changed_files).toContain('docs/operations.md');
  });

  it('hardens generic Flask JSON APIs with validation, logging and industrial tests', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-flask-generic-hardening-'));
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask\npytest>=8.0\n');
    await fs.writeFile(path.join(dir, 'app.py'), [
      'import os',
      'from flask import Flask, jsonify, request',
      '',
      'app = Flask(__name__)',
      '',
      '@app.post("/summarize")',
      'def summarize():',
      '    token = os.environ.get("SERVICE_TOKEN", "")',
      '    text = (request.get_json(silent=True) or {}).get("text", "")',
      '    return jsonify({"token": token, "summary": text[:20]})',
      '',
    ].join('\n'));

    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'generic-flask-hardening',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Harden Flask public runtime controls',
        description: 'Generic Flask API needs validation, logging and industrial tests',
        acceptance_criteria: ['generic JSON routes validate input and log operational events'],
        expected_changed_files: ['app.py', 'tests/test_app.py'],
        verification_commands: ['python3 -m pytest tests/test_app.py -q'],
        priority: 'high',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    const app = await fs.readFile(path.join(dir, 'app.py'), 'utf8');
    expect(app).toContain('logger.info("summarize request"');
    expect(app).toContain('invalid_text');
    const tests = await fs.readFile(path.join(dir, 'tests', 'test_app.py'), 'utf8');
    expect(tests).toContain('test_summarize_rejects_missing_text');
    expect(tests).toContain('test_summarize_returns_summary');
    expect(result.verification_evidence.every((e) => e.passed)).toBe(true);
  });

  it('hardens Flask chat APIs with missing-message validation and tests', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-flask-chat-hardening-'));
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask\npytest>=8.0\n');
    await fs.writeFile(path.join(dir, 'app.py'), [
      'from flask import Flask, jsonify, request',
      '',
      'app = Flask(__name__)',
      '',
      '@app.post("/chat")',
      'def chat():',
      '    body = request.get_json(silent=True) or {}',
      '    message = body.get("message", "")',
      '    return jsonify({"reply": message.upper()})',
      '',
    ].join('\n'));

    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'chat-flask-hardening',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Harden Flask public runtime controls',
        description: 'Chat APIs need validation, logging and industrial tests',
        acceptance_criteria: ['chat route validates missing messages and logs operational events'],
        expected_changed_files: ['app.py', 'tests/test_app.py'],
        verification_commands: ['python3 -m pytest tests/test_app.py -q'],
        priority: 'high',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    const app = await fs.readFile(path.join(dir, 'app.py'), 'utf8');
    expect(app).toContain('logger.info("chat request"');
    expect(app).toContain('invalid_message');
    const tests = await fs.readFile(path.join(dir, 'tests', 'test_app.py'), 'utf8');
    expect(tests).toContain('test_chat_rejects_missing_message');
    expect(result.verification_evidence.every((e) => e.passed)).toBe(true);
  });

  it('adds a social deduction rules engine and patches random tie resolution', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-werewolf-rules-'));
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'pytest>=8.0.0\n');
    await fs.writeFile(path.join(dir, 'game.py'), [
      'import random',
      'from collections import Counter',
      'GAME_MODES = {"m6": {"roles": ["werewolf", "seer", "witch", "villager"]}}',
      'class Player:',
      '    def __init__(self, role, alive=True):',
      '        self.role = role',
      '        self.alive = alive',
      'class GameMaster:',
      '    def __init__(self):',
      '        self.players = [Player("werewolf"), Player("villager")]',
      '    def alive(self):',
      '        return [p for p in self.players if p.alive]',
      '    def _balance(self):',
      '        wolves = [p for p in self.alive() if p.role == "werewolf"]',
      '        goods = [p for p in self.alive() if p.role != "werewolf"]',
      '        return len(wolves), len(goods)',
      '    def broadcast(self, text):',
      '        self.last_broadcast = text',
      '    def _resolve_death_with_chain(self, pid, cause):',
      '        self.executed = pid',
      '    def winner(self):',
      '        wolves, goods = self._balance()',
      '        if wolves == 0:',
      '            return "好人"',
      '        if wolves >= goods:',
      '            return "狼人"',
      '        return None',
      '    def resolve_vote(self, votes):',
      '        tally = Counter(votes.values())',
      '        top = max(tally.values())',
      '        cands = [pid for pid, c in tally.items() if c == top]',
      '        if len(cands) > 1:',
      '            executed = random.choice(cands)',
      '            self.broadcast(f"平局随机放逐 {executed}")',
      '        else:',
      '            executed = cands[0]',
      '        self._resolve_death_with_chain(executed, "vote")',
      '        return executed',
      '',
    ].join('\n'));

    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'rules1',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Add social deduction rules engine',
        description: 'Move werewolf rules into tested product logic',
        acceptance_criteria: ['rules.py exists', 'tie votes are not random'],
        expected_changed_files: ['game.py', 'rules.py', 'tests/test_rules.py', 'docs/game-design.md'],
        verification_commands: ['python3 -m pytest tests/test_rules.py -q'],
        priority: 'high',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    expect(result.changed_files).toContain('rules.py');
    expect(result.changed_files).toContain('tests/test_rules.py');
    expect(result.changed_files).toContain('game.py');
    const game = await fs.readFile(path.join(dir, 'game.py'), 'utf8');
    expect(game).toContain('validate_game_modes');
    expect(game).toContain('_MODE_VALIDATION = validate_game_modes(GAME_MODES)');
    expect(game).not.toContain('random.choice(cands)');
    const rules = await fs.readFile(path.join(dir, 'rules.py'), 'utf8');
    expect(rules).toContain('def resolve_vote_result');
    expect(rules).toContain('def winner_from_alive_roles');
    expect(rules).toContain('def validate_mode_config');
    expect(rules).toContain('def validate_game_modes');
    const tests = await fs.readFile(path.join(dir, 'tests', 'test_rules.py'), 'utf8');
    expect(tests).toContain('test_mode_config_validation_rejects_wolf_majority');
  });

  it('writes a social deduction market parity roadmap without claiming implementation is complete', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-werewolf-market-roadmap-'));
    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'market1',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Define social deduction market parity roadmap',
        description: 'Engineering baseline is not mature product parity',
        acceptance_criteria: ['docs/market-parity.md exists'],
        expected_changed_files: ['docs/market-parity.md'],
        verification_commands: ['test -s docs/market-parity.md'],
        priority: 'medium',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    expect(result.changed_files).toContain('docs/market-parity.md');
    const doc = await fs.readFile(path.join(dir, 'docs', 'market-parity.md'), 'utf8');
    expect(doc).toContain('Documentation alone may guide work');
    expect(doc).toContain('Account identity');
    expect(doc).toContain('Ranked');
  });

  it('implements a tested social deduction product backbone for market parity gaps', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-werewolf-product-backbone-'));
    await fs.writeFile(path.join(dir, 'README.md'), '# Werewolf Demo\n\nA 狼人杀 social deduction demo.\n');
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'werewolf-demo', scripts: {} }, null, 2));
    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'market-backbone',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Implement social deduction product backbone',
        description: 'Social deduction product maturity is below mature market parity',
        acceptance_criteria: ['product backbone has executable tests'],
        expected_changed_files: [
          'accounts.py',
          'lobby.py',
          'communication.py',
          'moderation.py',
          'ranking.py',
          'history.py',
          'roles_catalog.py',
          'liveops.py',
          'admin.py',
          'host_controls.py',
          'tests/test_product_backbone.py',
          'docs/market-parity.md',
          'package.json',
        ],
        verification_commands: ['python3 -m pytest tests/test_product_backbone.py -q'],
        priority: 'medium',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    expect(result.changed_files).toContain('accounts.py');
    expect(result.changed_files).toContain('lobby.py');
    expect(result.changed_files).toContain('tests/test_product_backbone.py');
    const tests = await fs.readFile(path.join(dir, 'tests', 'test_product_backbone.py'), 'utf8');
    expect(tests).toContain('test_account_lobby_and_host_flow');
    const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
    expect(pkg.scripts.test).toBe('python3 -m pytest -q');
  });

  it('implements source-backed agent evaluation market gaps with a replay harness', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-agent-evaluation-gap-'));
    await fs.writeFile(path.join(dir, 'README.md'), '# Agent Werewolf\n\nAgent-facing social deduction demo.\n');
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'agent-werewolf', scripts: {} }, null, 2));

    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'agent-eval-gap',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Close market capability gap: Agent evaluation harness',
        description: 'Source-backed market research identified seeded replay/evaluation as a mature-product capability.',
        acceptance_criteria: ['evaluation harness exists as behavior, not only documentation'],
        expected_changed_files: ['evaluation.py', 'replay.py', 'tests/test_eval_harness.py', 'tests/test_replay.py', 'docs/agent-evaluation.md', 'README.md', 'package.json'],
        verification_commands: ['python3 -m pytest tests/test_eval_harness.py tests/test_replay.py -q'],
        priority: 'high',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    expect(result.changed_files).toContain('evaluation.py');
    expect(result.changed_files).toContain('replay.py');
    expect(result.changed_files).toContain('tests/test_eval_harness.py');
    expect(result.changed_files).toContain('tests/test_replay.py');
    expect(result.changed_files).toContain('docs/agent-evaluation.md');
    const evaluation = await fs.readFile(path.join(dir, 'evaluation.py'), 'utf8');
    expect(evaluation).toContain('class AgentEvaluationHarness');
    expect(evaluation).toContain('"events"');
    const readme = await fs.readFile(path.join(dir, 'README.md'), 'utf8');
    expect(readme).toContain('## Agent Evaluation');
    const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
    expect(pkg.scripts['agent:evaluate']).toBe('python3 -m pytest tests/test_eval_harness.py tests/test_replay.py -q');
  });

  it('hardens the agent-facing werewolf product loop as executable behavior', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-agent-product-loop-'));
    await fs.mkdir(path.join(dir, 'templates'), { recursive: true });
    await fs.writeFile(path.join(dir, 'README.md'), '# Werewolf Agents\n\nAgent-facing demo.\n');
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'werewolf-agents', scripts: {} }, null, 2));
    await fs.writeFile(path.join(dir, 'app.py'), [
      'from flask import Flask',
      'app = Flask(__name__)',
      '@app.route("/")',
      'def index(): return "ok"',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'game.py'), 'def play():\n    return "ok"\n');
    await fs.writeFile(path.join(dir, 'player.py'), 'class Player:\n    pass\n');
    await fs.writeFile(path.join(dir, 'prompts.py'), 'def build_system_prompt():\n    return "role secrecy guardrail invalid action"\n');
    await fs.writeFile(path.join(dir, 'templates', 'index.html'), '<form id="start-form"></form>\n');

    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'agent-product-loop',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Harden agent-facing werewolf product loop',
        description: 'Agent-facing product maturity is below market-ready.',
        acceptance_criteria: ['agent product loop has provider config, rules, replay and evaluation behavior'],
        expected_changed_files: ['llm_config.py', 'rules.py', 'evaluation.py', 'replay.py', 'docs/agent-product.md'],
        verification_commands: ['python3 -m pytest -q'],
        priority: 'high',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    expect(result.changed_files).toContain('llm_config.py');
    expect(result.changed_files).toContain('rules.py');
    expect(result.changed_files).toContain('evaluation.py');
    expect(result.changed_files).toContain('replay.py');
    expect(result.changed_files).toContain('docs/agent-product.md');
    const doc = await fs.readFile(path.join(dir, 'docs', 'agent-product.md'), 'utf8');
    expect(doc).toContain('agent simulation');
  });

  it('integrates social product backbone into Flask app workflows', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-werewolf-integrate-backbone-'));
    await fs.mkdir(path.join(dir, 'templates'), { recursive: true });
    await fs.writeFile(path.join(dir, 'app.py'), [
      'from flask import Flask, jsonify',
      'app = Flask(__name__)',
      '@app.route("/")',
      'def index():',
      '    return "Werewolf"',
      '@app.route("/healthz")',
      'def healthz():',
      '    return jsonify({"status": "ok"})',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'templates', 'index.html'), '<main><h1>Werewolf</h1></main>\n');
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'werewolf-demo', scripts: {} }, null, 2));
    await fs.writeFile(path.join(dir, 'accounts.py'), socialBackboneFixture('class AccountStore:\n    pass\n'));
    await fs.writeFile(path.join(dir, 'lobby.py'), socialBackboneFixture('class LobbyManager:\n    pass\n'));
    await fs.writeFile(path.join(dir, 'communication.py'), socialBackboneFixture('class WebSocketPresenceHub:\n    pass\n'));
    await fs.writeFile(path.join(dir, 'moderation.py'), socialBackboneFixture('class ModerationLog:\n    pass\n'));
    await fs.writeFile(path.join(dir, 'ranking.py'), socialBackboneFixture('class RankedSeasonLeaderboard:\n    pass\n'));
    await fs.writeFile(path.join(dir, 'history.py'), socialBackboneFixture('class SQLiteMatchHistory:\n    pass\n'));
    await fs.writeFile(path.join(dir, 'roles_catalog.py'), 'ROLE_REGISTRY = {"werewolf": {}, "seer": {}, "witch": {}, "villager": {}}\nMODE_CATALOG = {"classic": []}\n');
    await fs.writeFile(path.join(dir, 'liveops.py'), socialBackboneFixture('class LiveOpsStore:\n    pass\n'));
    await fs.writeFile(path.join(dir, 'admin.py'), socialBackboneFixture('class AdminConsole:\n    pass\n'));
    await fs.writeFile(path.join(dir, 'host_controls.py'), socialBackboneFixture('class HostControls:\n    pass\nclass RoomSettings:\n    pass\n'));

    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'integrate-backbone',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Integrate social product backbone into app workflows',
        description: 'Social product backbone modules are disconnected from the running app',
        acceptance_criteria: ['Flask routes expose product workflows'],
        expected_changed_files: ['app.py', 'templates/index.html', 'tests/test_product_integration.py', 'docs/market-parity.md'],
        verification_commands: ['python3 -m pytest tests/test_product_integration.py -q'],
        priority: 'high',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    expect(result.changed_files).toContain('app.py');
    expect(result.changed_files).toContain('tests/test_product_integration.py');
    const app = await fs.readFile(path.join(dir, 'app.py'), 'utf8');
    expect(app).toContain('/product/lobby');
    expect(app).toContain('AccountStore');
    const template = await fs.readFile(path.join(dir, 'templates', 'index.html'), 'utf8');
    expect(template).toContain('product-workflows');
  });

  it('writes a source-cited market research roadmap from the research report', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-market-research-roadmap-'));
    await fs.mkdir(path.join(dir, '.demo2project', 'research'), { recursive: true });
    await fs.writeFile(path.join(dir, '.demo2project', 'research', 'latest.json'), JSON.stringify({
      schema_version: 1,
      generated_at: new Date(0).toISOString(),
      project_path: dir,
      domain: 'web_ui_app',
      query: 'production UI competitors',
      search_provider: 'fixture',
      copy_policy: 'Use competitor material only to extract capabilities; do not copy names, text, UI, code, or brand assets.',
      sources: [{ title: 'UI benchmark', url: 'https://example.com/ui', retrieved_at: new Date(0).toISOString(), snippet: 'Responsive accessible UI.' }],
      capabilities: [{
        id: 'responsive_accessible_ui',
        label: 'Responsive and accessible UI',
        description: 'Keyboard, touch, responsive layout and semantic labels.',
        importance: 'required',
        source_urls: ['https://example.com/ui'],
        local_evidence_patterns: ['aria-', '@media'],
      }],
      risks: [],
      confidence: 'medium',
    }));

    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'market-research1',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Define source-cited market research roadmap',
        description: 'Dynamic competitor research found missing capabilities',
        acceptance_criteria: ['docs/market-research-roadmap.md exists'],
        expected_changed_files: ['docs/market-research-roadmap.md'],
        verification_commands: ['test -s docs/market-research-roadmap.md'],
        priority: 'medium',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    expect(result.changed_files).toContain('docs/market-research-roadmap.md');
    const doc = await fs.readFile(path.join(dir, 'docs', 'market-research-roadmap.md'), 'utf8');
    expect(doc).toContain('Responsive and accessible UI');
    expect(doc).toContain('https://example.com/ui');
    expect(doc).toContain('Do not copy competitor');
  });

  it('adds player-supplied LLM provider configuration for Flask LLM demos', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-llm-provider-config-'));
    await fs.mkdir(path.join(dir, 'templates'), { recursive: true });
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask>=3.0.0\nopenai>=1.0.0\npytest>=8.0.0\n');
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
      'class Player:',
      '    def __init__(self, client):',
      '        self.client = client',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'game.py'), [
      'from player import Player, make_client, MODEL',
      'class GameMaster:',
      '    def __init__(self, mode="m6", emit=None, speed=1.0):',
      '        self.client = make_client()',
      '        self.player = Player(self.client)',
      '    def run(self):',
      '        return None',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'app.py'), [
      'import queue, threading, time, uuid',
      'from flask import Flask, jsonify, request, render_template',
      'from config import require_api_key, max_active_games',
      'from game import GameMaster',
      'from player import MODEL, BASE_URL',
      'app = Flask(__name__)',
      '@app.route("/")',
      'def index():',
      '    return render_template("index.html")',
      '@app.route("/config")',
      'def config():',
      '    return jsonify({',
      '        "model": MODEL,',
      '        "base_url": BASE_URL,',
      '        "has_key": False,',
      '    })',
      '@app.route("/start", methods=["POST"])',
      'def start_game():',
      '    has_key, error_msg = require_api_key()',
      '    if not has_key:',
      '        return jsonify({"error": error_msg}), 400',
      '    body = request.get_json(silent=True) or {}',
      '    game_id = uuid.uuid4().hex[:8]',
      '    GameMaster(mode=body.get("mode", "m6"), emit=lambda e: None, speed=body.get("speed", 1.0)).run()',
      '    return jsonify({"game_id": game_id})',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'templates', 'index.html'), [
      '<select id="speedSelect"><option value="1">1x</option></select>',
      '<button id="start">start</button>',
      '<script>',
      'const selectedMode = "m6";',
      'document.getElementById("start").addEventListener("click", async () => {',
      '  const r = await fetch("/start", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({mode:selectedMode, speed:1})});',
      '  const { game_id } = await r.json();',
      '  console.log(game_id);',
      '});',
      '</script>',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'tests', 'test_app.py'), [
      'def test_start_without_api_key_returns_400(client):',
      '    response = client.post("/start", json={"mode": "m6"})',
      '    assert response.status_code == 400',
      '    data = response.get_json()',
      '    assert "API key" in data["error"] or "DEEPSEEK_API_KEY" in data["error"] or "OPENAI_API_KEY" in data["error"]',
      '',
      'def test_start_rejects_when_active_game_limit_reached(client, monkeypatch):',
      '    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")',
      '    response = client.post("/start", json={"mode": "m6"})',
      '    assert response.status_code == 429',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'tests', 'test_regression.py'), [
      'def test_regression_invalid_mode_is_rejected(client):',
      '    response = client.post("/start", json={"mode": "invalid_mode"})',
      '    assert response.status_code == 400',
      '    assert response.get_json()["error"] == "invalid_mode"',
      '',
    ].join('\n'));

    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'llm1',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Add player-supplied LLM provider configuration',
        description: 'Players need to bring their own model key/provider',
        acceptance_criteria: ['providers endpoint exists', 'player key is accepted per start request'],
        expected_changed_files: ['app.py', 'player.py', 'game.py', 'templates/index.html', 'llm_config.py', 'tests/test_llm_config.py'],
        verification_commands: ['python3 -m pytest tests/test_llm_config.py -q'],
        priority: 'high',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    expect(result.changed_files).toContain('llm_config.py');
    expect(result.changed_files).toContain('tests/test_llm_config.py');
    expect(result.changed_files).toContain('app.py');
    expect(result.changed_files).toContain('tests/test_app.py');
    const llmConfig = await fs.readFile(path.join(dir, 'llm_config.py'), 'utf8');
    expect(llmConfig).toContain('"minimax"');
    expect(llmConfig).toContain('"qwen"');
    expect(llmConfig).toContain('redacted_config');
    expect(llmConfig).toContain('WW_ALLOW_SERVER_LLM_KEY_FALLBACK');
    expect(llmConfig).toContain('"models": [');
    expect(llmConfig).toContain('"source_url": "https://platform.minimax.io/');
    expect(llmConfig).toContain('"source_kind": "official_docs_snapshot"');
    const app = await fs.readFile(path.join(dir, 'app.py'), 'utf8');
    expect(app).toContain('resolve_llm_config(body)');
    expect(app).toContain('public_provider_config()');
    expect(app).toContain('llm_config=llm_config["config"]');
    expect(app).toContain('"providers": public_provider_config()["providers"]');
    expect(app).not.toContain('    , "providers"');
    const player = await fs.readFile(path.join(dir, 'player.py'), 'utf8');
    expect(player).toContain('def make_client(api_key');
    const game = await fs.readFile(path.join(dir, 'game.py'), 'utf8');
    expect(game).toContain('llm_config=None');
    const html = await fs.readFile(path.join(dir, 'templates', 'index.html'), 'utf8');
    expect(html).toContain('llmApiKey');
    expect(html).toContain('provider:');
    expect(html).toContain('if (!r.ok)');
    const appTests = await fs.readFile(path.join(dir, 'tests', 'test_app.py'), 'utf8');
    expect(appTests).toContain('assert data["error"] == "missing_api_key"');
    expect(appTests).toContain('json={"mode": "m6", "api_key": "test-key"}');
    const regressionTests = await fs.readFile(path.join(dir, 'tests', 'test_regression.py'), 'utf8');
    expect(regressionTests).toContain('json={"mode": "invalid_mode", "api_key": "test-key"}');
  });

  it('generalizes player-supplied LLM provider configuration to simple Flask chat demos', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-llm-chat-provider-config-'));
    await fs.mkdir(path.join(dir, 'templates'), { recursive: true });
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask>=3.0.0\nopenai>=1.0.0\npytest>=8.0.0\n');
    await fs.writeFile(path.join(dir, 'app.py'), [
      'import os',
      'from flask import Flask, jsonify, render_template, request',
      'from openai import OpenAI',
      '',
      'app = Flask(__name__)',
      'client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))',
      '',
      '@app.get("/")',
      'def index():',
      '    return render_template("index.html")',
      '',
      '@app.post("/chat")',
      'def chat():',
      '    body = request.get_json(silent=True) or {}',
      '    message = body.get("message", "")',
      '    response = client.chat.completions.create(',
      '        model=os.environ.get("WW_MODEL", "gpt-3.5-turbo"),',
      '        messages=[{"role": "user", "content": message}],',
      '    )',
      '    return jsonify({"reply": response.choices[0].message.content})',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'templates', 'index.html'), [
      '<form id="chat">',
      '  <select id="llmProvider">',
      '    <option value="openai"></option>',
      '  </select>',
      '  <input id="message" placeholder="message">',
      '  <button>Send</button>',
      '</form>',
      '<script>',
      'document.querySelector("#chat").addEventListener("submit", async (event) => {',
      '  event.preventDefault();',
      '  await fetch("/chat", {',
      '    method: "POST",',
      '    headers: {"Content-Type": "application/json"},',
      '    body: JSON.stringify({message: document.querySelector("#message").value})',
      '  });',
      '});',
      '</script>',
      '',
    ].join('\n'));

    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'llm-chat',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Add player-supplied LLM provider configuration',
        description: 'A generic chat demo should not require a server-wide OpenAI key',
        acceptance_criteria: ['chat route uses per-request LLM provider config'],
        expected_changed_files: ['app.py', 'templates/index.html', 'llm_config.py', 'tests/test_llm_config.py'],
        verification_commands: ['python3 -m py_compile app.py llm_config.py', 'python3 -m pytest tests/test_llm_config.py -q'],
        priority: 'high',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    const app = await fs.readFile(path.join(dir, 'app.py'), 'utf8');
    expect(app).toContain('@app.get("/config")');
    expect(app).toContain('llm_config = resolve_llm_config(body)');
    expect(app).toContain('OpenAI(');
    expect(app).toContain('api_key=llm_config["config"]["api_key"]');
    expect(app).toContain('base_url=llm_config["config"]["base_url"]');
    expect(app).toContain('model=llm_config["config"]["model"]');
    expect(app).not.toContain('client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))');
    expect(app).not.toContain('model=os.environ.get("WW_MODEL"');
    const html = await fs.readFile(path.join(dir, 'templates', 'index.html'), 'utf8');
    expect(html).toContain('id="llmProvider"');
    expect(html).toContain('id="llmModel"');
    expect(html).toContain('id="llmBaseUrl"');
    expect(html).toContain('id="llmApiKey"');
    expect(html).toContain('provider: document.getElementById("llmProvider")');
    expect(html).toContain('api_key: document.getElementById("llmApiKey")');
    const categories = (await new AnalyzerAgent().fullAnalyze(dir)).gap.findings.map((finding) => finding.category);
    expect(categories).not.toContain('missing_user_llm_provider_config');
  });

  it('repairs blank LLM provider select labels by aligning provider contract and template fallback', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-llm-provider-select-'));
    await fs.mkdir(path.join(dir, 'templates'), { recursive: true });
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'llm_config.py'), [
      'def public_provider_config():',
      '    return {"providers": [',
      '        {"id": "deepseek", "name": "DeepSeek", "base_url": "https://api.deepseek.com", "models": ["deepseek-chat"]},',
      '        {"id": "openai", "name": "OpenAI", "base_url": "https://api.openai.com", "models": ["gpt-4o-mini"]},',
      '    ], "requires_player_key": True}',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'templates', 'index.html'), [
      '<select id="llmProvider"></select>',
      '<input id="llmModel">',
      '<input id="llmBaseUrl">',
      '<script>',
      'const $llmProvider = document.getElementById("llmProvider");',
      'const providerPresets = cfg.providers;',
      '$llmProvider.innerHTML = providerPresets.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.label)}</option>`).join("");',
      'const providerLabel = provider ? provider.label : ($llmProvider.value || "LLM");',
      '</script>',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'tests', 'test_llm_config.py'), [
      'from llm_config import public_provider_config',
      '',
      'def test_public_provider_config_contains_supported_presets_without_keys():',
      '    config = public_provider_config()',
      '    assert config["providers"]',
      '',
    ].join('\n'));

    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'llm-select',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Repair LLM provider select option labels',
        description: 'LLM provider select renders empty option labels',
        acceptance_criteria: ['provider labels are non-empty'],
        expected_changed_files: ['llm_config.py', 'templates/index.html', 'tests/test_llm_config.py'],
        verification_commands: ['python3 -m pytest tests/test_llm_config.py -q'],
        priority: 'high',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    expect(result.changed_files).toContain('llm_config.py');
    expect(result.changed_files).toContain('templates/index.html');
    expect(result.changed_files).toContain('tests/test_llm_config.py');
    const llmConfig = await fs.readFile(path.join(dir, 'llm_config.py'), 'utf8');
    expect(llmConfig).toContain('"label": "DeepSeek"');
    expect(llmConfig).toContain('"default_model": "deepseek-chat"');
    const html = await fs.readFile(path.join(dir, 'templates', 'index.html'), 'utf8');
    expect(html).toContain('p.label || p.name || p.id');
    const tests = await fs.readFile(path.join(dir, 'tests', 'test_llm_config.py'), 'utf8');
    expect(tests).toContain('test_provider_presets_have_non_empty_ui_labels');
  });

  it('expands an existing LLM provider catalog without rewriting runtime contracts', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-llm-provider-catalog-'));
    await fs.mkdir(path.join(dir, 'templates'), { recursive: true });
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'llm_config.py'), [
      'from __future__ import annotations',
      '',
      'import os',
      'from typing import Any',
      '',
      'PROVIDER_PRESETS: dict[str, dict[str, str]] = {',
      '    "deepseek": {"label": "DeepSeek", "base_url": "https://api.deepseek.com", "default_model": "deepseek-chat"},',
      '    "openai": {"label": "OpenAI", "base_url": "https://api.openai.com/v1", "default_model": "gpt-4o-mini"},',
      '}',
      '',
      'def public_provider_config() -> dict[str, Any]:',
      '    return {"providers": [{"id": provider_id, **preset} for provider_id, preset in PROVIDER_PRESETS.items()], "requires_player_key": True}',
      '',
      'def resolve_llm_config(payload: dict[str, Any] | None, environ: dict[str, str] | None = None) -> dict[str, Any]:',
      '    payload = payload or {}',
      '    environ = environ if environ is not None else os.environ',
      '    return {"ok": False, "error": "api_key_required"}',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'templates', 'index.html'), [
      '<select id="llmProvider"></select>',
      '<script>',
      'const providerPresets = cfg.providers;',
      'document.getElementById("llmProvider").innerHTML = providerPresets.map(p => `<option>${p.label}</option>`).join("");',
      '</script>',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'tests', 'test_llm_config.py'), [
      'from llm_config import public_provider_config, resolve_llm_config',
      '',
      'def test_missing_player_key_keeps_existing_api_contract():',
      '    assert resolve_llm_config({}, environ={})["error"] == "api_key_required"',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'app.py'), 'APP_SENTINEL = "do-not-rewrite"\n');
    await fs.writeFile(path.join(dir, 'player.py'), 'PLAYER_SENTINEL = "do-not-rewrite"\n');
    await fs.writeFile(path.join(dir, 'tests', 'test_app.py'), 'APP_TEST_SENTINEL = "do-not-rewrite"\n');
    await fs.mkdir(path.join(dir, '.demo2project', 'research'), { recursive: true });
    await fs.writeFile(path.join(dir, '.demo2project', 'research', 'llm-model-catalog.json'), JSON.stringify({
      schema_version: 1,
      generated_at: new Date(0).toISOString(),
      providers: [
        {
          id: 'minimax',
          label: 'MiniMax',
          base_url: 'https://api.minimax.io/v1',
          default_model: 'MiniMax-M2.7-official',
          models: ['MiniMax-M2.7-official', 'MiniMax-M2.7-highspeed-official'],
          source_url: 'https://platform.minimax.io/docs/guides/text-generation',
          source_name: 'MiniMax official model docs',
          source_kind: 'live_official_docs',
          retrieved_at: new Date(0).toISOString(),
        },
      ],
      warnings: [],
    }, null, 2));

    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'llm-catalog',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Expand player-selectable LLM provider catalog',
        description: 'Provider presets omit MiniMax, Qwen and custom endpoints',
        acceptance_criteria: ['catalog includes common providers without changing API contracts'],
        expected_changed_files: ['llm_config.py', 'templates/index.html', 'tests/test_llm_config.py'],
        verification_commands: ['python3 -m pytest tests/test_llm_config.py -q'],
        priority: 'medium',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    expect(result.changed_files).toContain('llm_config.py');
    expect(result.changed_files).toContain('tests/test_llm_config.py');
    expect(result.changed_files).not.toContain('app.py');
    expect(result.changed_files).not.toContain('player.py');
    expect(result.changed_files).not.toContain('tests/test_app.py');
    const llmConfig = await fs.readFile(path.join(dir, 'llm_config.py'), 'utf8');
    expect(llmConfig).toContain('"minimax"');
    expect(llmConfig).toContain('"qwen"');
    expect(llmConfig).toContain('"custom"');
    expect(llmConfig).toContain('"MiniMax-M2.7-official"');
    expect(llmConfig).toContain('"models": [');
    expect(llmConfig).toContain('"source_url": "https://platform.minimax.io/docs/guides/text-generation"');
    expect(llmConfig).toContain('"api_key_required"');
    await expect(fs.readFile(path.join(dir, 'app.py'), 'utf8')).resolves.toBe('APP_SENTINEL = "do-not-rewrite"\n');
    await expect(fs.readFile(path.join(dir, 'player.py'), 'utf8')).resolves.toBe('PLAYER_SENTINEL = "do-not-rewrite"\n');
    await expect(fs.readFile(path.join(dir, 'tests', 'test_app.py'), 'utf8')).resolves.toBe('APP_TEST_SENTINEL = "do-not-rewrite"\n');
  });

  it('upgrades old generated LLM configs to expose official model metadata without stale qwen assertions', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-old-llm-catalog-upgrade-'));
    await fs.mkdir(path.join(dir, 'templates'), { recursive: true });
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.mkdir(path.join(dir, '.demo2project', 'research'), { recursive: true });
    await fs.writeFile(path.join(dir, '.demo2project', 'research', 'llm-model-catalog.json'), JSON.stringify({
      schema_version: 1,
      generated_at: new Date(0).toISOString(),
      providers: [
        {
          id: 'deepseek',
          label: 'DeepSeek',
          base_url: 'https://api.deepseek.com',
          default_model: 'deepseek-v4-flash',
          models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
          source_url: 'https://api-docs.deepseek.com/api/list-models',
          source_name: 'DeepSeek API official model docs',
          source_kind: 'live_official_docs',
          retrieved_at: new Date(0).toISOString(),
        },
        {
          id: 'qwen',
          label: 'Qwen',
          base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
          default_model: 'qwen3.6-plus',
          models: ['qwen3.6-plus', 'qwen3.6-max-preview'],
          source_url: 'https://www.alibabacloud.com/help/en/model-studio/text-generation-model',
          source_name: 'Alibaba Cloud Model Studio official model docs',
          source_kind: 'live_official_docs',
          retrieved_at: new Date(0).toISOString(),
        },
      ],
      warnings: [],
    }, null, 2));
    await fs.writeFile(path.join(dir, 'llm_config.py'), [
      'from __future__ import annotations',
      '',
      'import os',
      'from typing import Any',
      '',
      '',
      'PROVIDER_PRESETS: dict[str, dict[str, Any]] = {',
      '    "deepseek": {',
      '        "label": "DeepSeek",',
      '        "base_url": "https://api.deepseek.com",',
      '        "default_model": "deepseek-v4-flash",',
      '    },',
      '    "qwen": {',
      '        "label": "Qwen",',
      '        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",',
      '        "default_model": "qwen-plus",',
      '    },',
      '    "minimax": {',
      '        "label": "MiniMax",',
      '        "base_url": "https://api.minimax.io/v1",',
      '        "default_model": "MiniMax-M2.7",',
      '    },',
      '    "openai": {',
      '        "label": "OpenAI compatible",',
      '        "base_url": "https://api.openai.com/v1",',
      '        "default_model": "gpt-4o-mini",',
      '    },',
      '    "custom": {',
      '        "label": "Custom OpenAI-compatible endpoint",',
      '        "base_url": "",',
      '        "default_model": "",',
      '    },',
      '}',
      '',
      '',
      'def public_provider_config() -> dict[str, Any]:',
      '    return {',
      '        "providers": [',
      '            {',
      '                "id": provider_id,',
      '                "label": preset["label"],',
      '                "base_url": preset["base_url"],',
      '                "default_model": preset["default_model"],',
      '            }',
      '            for provider_id, preset in PROVIDER_PRESETS.items()',
      '        ],',
      '        "requires_player_key": True,',
      '    }',
      '',
      '',
      'def resolve_llm_config(payload: dict[str, Any] | None, environ: dict[str, str] | None = None) -> dict[str, Any]:',
      '    payload = payload or {}',
      '    provider = str(payload.get("provider") or "deepseek").strip().lower()',
      '    preset = PROVIDER_PRESETS[provider]',
      '    api_key = str(payload.get("api_key") or "").strip()',
      '    if not api_key:',
      '        return {"ok": False, "error": "api_key_required", "providers": public_provider_config()}',
      '    return {"ok": True, "config": {"provider": provider, "api_key": api_key, "base_url": preset["base_url"], "model": str(payload.get("model") or preset["default_model"]).strip()}}',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'templates', 'index.html'), '<select id="llmProvider"></select><input id="llmModel">\n');
    await fs.writeFile(path.join(dir, 'tests', 'test_llm_config.py'), [
      'from llm_config import public_provider_config, resolve_llm_config',
      '',
      '',
      'def test_resolve_supports_qwen_preset():',
      '    result = resolve_llm_config({"provider": "qwen", "api_key": "qwen-key"}, environ={})',
      '    assert result["ok"] is True',
      '    assert "dashscope" in result["config"]["base_url"]',
      '    assert result["config"]["model"] == "qwen-plus"',
      '',
    ].join('\n'));

    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'old-llm-catalog-upgrade',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Expand player-selectable LLM provider catalog',
        description: 'Existing generated LLM config needs official model choices',
        acceptance_criteria: ['public provider config exposes official model choices'],
        expected_changed_files: ['llm_config.py', 'tests/test_llm_config.py'],
        verification_commands: ['python3 -m pytest tests/test_llm_config.py -q'],
        priority: 'high',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    const llmConfig = await fs.readFile(path.join(dir, 'llm_config.py'), 'utf8');
    expect(llmConfig.match(/"default_model": "qwen3\.6-plus"/g)?.length).toBe(1);
    expect(llmConfig).toContain('"models": list(preset.get("models", []))');
    expect(llmConfig).toContain('"source_url": preset.get("source_url", "")');
    const tests = await fs.readFile(path.join(dir, 'tests', 'test_llm_config.py'), 'utf8');
    expect(tests).toContain('providers = {provider["id"]: provider for provider in public_provider_config()["providers"]}');
    expect(tests).toContain('assert result["config"]["model"] == providers["qwen"]["default_model"]');
    expect(tests).not.toContain('== "qwen-plus"');
  });

  it('repairs LLM config compatibility regressions without replacing existing app behavior', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-llm-contract-repair-'));
    await fs.mkdir(path.join(dir, 'scripts'), { recursive: true });
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'app.py'), [
      'from flask import Flask, jsonify, request',
      'from llm_config import resolve_llm_config',
      'app = Flask(__name__)',
      '@app.route("/start", methods=["POST"])',
      'def start_game():',
      '    llm_config = resolve_llm_config(request.get_json(silent=True) or {})',
      '    if not llm_config["ok"]:',
      '        return jsonify({"error": llm_config["error"]}), 400',
      '    return jsonify({"ok": True})',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'llm_config.py'), [
      'from __future__ import annotations',
      '',
      'import os',
      'from typing import Any',
      '',
      'PROVIDER_PRESETS: dict[str, dict[str, str]] = {',
      '    "deepseek": {"label": "DeepSeek", "base_url": "https://api.deepseek.com", "default_model": "deepseek-chat"},',
      '}',
      '',
      'def public_provider_config() -> dict[str, Any]:',
      '    return {"providers": [{"id": provider_id, **preset} for provider_id, preset in PROVIDER_PRESETS.items()], "requires_player_key": True}',
      '',
      'def resolve_llm_config(payload: dict[str, Any] | None, environ: dict[str, str] | None = None) -> dict[str, Any]:',
      '    payload = payload or {}',
      '    environ = environ if environ is not None else os.environ',
      '    api_key = str(payload.get("api_key") or "").strip()',
      '    allow_server_fallback = str(environ.get("WW_ALLOW_SERVER_LLM_KEY_FALLBACK", "")).lower() in {"1", "true", "yes", "on"}',
      '    if not api_key and allow_server_fallback:',
      '        api_key = environ.get("DEEPSEEK_API_KEY") or environ.get("OPENAI_API_KEY") or ""',
      '    if not api_key:',
      '        return {"ok": False, "error": "missing_api_key", "providers": public_provider_config()}',
      '    return {"ok": True, "config": {"api_key": api_key}}',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'tests', 'test_llm_config.py'), [
      'from llm_config import resolve_llm_config',
      '',
      'def test_missing_key_error_matches_api_contract():',
      '    assert resolve_llm_config({}, environ={})["error"] == "missing_api_key"',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'scripts', 'api_contract_check.py'), 'EXPECTED = "api_key_required"\n');
    await fs.writeFile(path.join(dir, 'scripts', 'config_contract_check.py'), [
      'import pathlib, re',
      'ROOT = pathlib.Path(__file__).resolve().parents[1]',
      String.raw`ENV_PATTERN = re.compile(r"""os\.environ\.(?:get|__getitem__)\(\s*["']([A-Z0-9_]+)["']""")`,
      'source = "\\n".join(path.read_text() for path in ROOT.rglob("*.py"))',
      'found = set(ENV_PATTERN.findall(source))',
      'assert "WW_ALLOW_SERVER_LLM_KEY_FALLBACK" in found',
      'assert "DEEPSEEK_API_KEY" in found',
      'assert "OPENAI_API_KEY" in found',
      '',
    ].join('\n'));

    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'llm-contract-repair',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Repair failing project verification',
        description: 'api contract expected api_key_required and config contract expected env vars in source',
        acceptance_criteria: ['existing API/config contracts are restored'],
        expected_changed_files: ['llm_config.py', 'tests/test_llm_config.py'],
        verification_commands: [
          'python3 -m pytest tests/test_llm_config.py -q',
          'python3 scripts/config_contract_check.py',
        ],
        priority: 'blocker',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    expect(result.changed_files).toEqual(expect.arrayContaining(['llm_config.py', 'tests/test_llm_config.py']));
    expect(result.changed_files).not.toContain('app.py');
    const llmConfig = await fs.readFile(path.join(dir, 'llm_config.py'), 'utf8');
    expect(llmConfig).toContain('"api_key_required"');
    expect(llmConfig).toContain('os.environ.get("WW_ALLOW_SERVER_LLM_KEY_FALLBACK"');
    expect(llmConfig).toContain('os.environ.get("DEEPSEEK_API_KEY"');
    expect(llmConfig).toContain('os.environ.get("OPENAI_API_KEY"');
  });

  it('repairs generated LLM config contract drift instead of preserving inconsistent tests', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-llm-generated-contract-drift-'));
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'app.py'), [
      'from llm_config import LLMConfigError, public_config, redact_config, validate_llm_config',
      '',
      'def start(body):',
      '    try:',
      '        cfg = validate_llm_config(body.get("llm", {}))',
      '    except LLMConfigError as exc:',
      '        return {"error": str(exc)}',
      '    return {"safe": redact_config(cfg), "public": public_config(cfg)}',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'llm_config.py'), [
      'from typing import Optional',
      '',
      'PROVIDER_PRESETS: dict[str, dict] = {',
      '    "deepseek": {"name": "DeepSeek", "base_url": "https://api.deepseek.com", "default_model": "deepseek-chat", "models": ["deepseek-chat"]},',
      '    "custom": {"name": "Custom", "base_url": "", "default_model": "", "models": []},',
      '}',
      '',
      'class LLMConfigError(ValueError):',
      '    pass',
      '',
      'def redact_key(key: Optional[str]) -> str:',
      '    if not key:',
      '        return "(none)"',
      '    if len(key) <= 8:',
      '        return "***"',
      '    return f"{key[:5]}...{key[-4:]}"',
      '',
      'def redact_config(config: dict) -> dict:',
      '    safe = dict(config)',
      '    if "api_key" in safe and safe["api_key"]:',
      '        safe["api_key"] = redact_key(safe["api_key"])',
      '    return safe',
      '',
      'def validate_llm_config(config: dict) -> dict:',
      '    api_key = config.get("api_key", "").strip()',
      '    if not api_key:',
      '        raise LLMConfigError("api_key is required")',
      '    provider = config.get("provider", "deepseek")',
      '    preset = PROVIDER_PRESETS[provider]',
      '    return {"provider": provider, "api_key": api_key, "base_url": preset["base_url"], "model": preset["default_model"]}',
      '',
      'def public_config(config: dict) -> dict:',
      '    return {k: v for k, v in config.items() if k != "api_key"}',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'tests', 'test_llm_config.py'), [
      'from llm_config import PROVIDER_PRESETS, redact_config, redact_key, validate_llm_config',
      '',
      'def test_generated_redaction_contract_drift():',
      '    assert redact_key("sk-abcdef123456") == "sk-ab...3456"',
      '    assert redact_key("sk-12345678") == "sk-1...5678"',
      '    assert redact_config({"provider": "deepseek"})["api_key"] == "(none)"',
      '',
      'def test_generated_custom_provider_has_model_drift():',
      '    cfg = validate_llm_config({"provider": "custom", "api_key": "sk-test", "base_url": "https://example.com/v1"})',
      '    assert cfg["model"]',
      '',
    ].join('\n'));

    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'llm-generated-contract-drift',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Repair failed verification: python3 -m pytest tests/test_llm_config.py -q',
        description: 'Generated LLM config tests failed around redact_key, missing api_key redaction and custom model defaults.',
        acceptance_criteria: ['LLM provider config exposes a stable product contract'],
        expected_changed_files: ['llm_config.py', 'tests/test_llm_config.py'],
        verification_commands: ['python3 -m pytest tests/test_llm_config.py -q'],
        priority: 'blocker',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    expect(result.changed_files).toEqual(expect.arrayContaining(['llm_config.py', 'tests/test_llm_config.py']));
    const llmConfig = await fs.readFile(path.join(dir, 'llm_config.py'), 'utf8');
    expect(llmConfig).toContain('def resolve_llm_config');
    expect(llmConfig).toContain('def public_provider_config');
    expect(llmConfig).toContain('"custom-model"');
    const tests = await fs.readFile(path.join(dir, 'tests', 'test_llm_config.py'), 'utf8');
    expect(tests).toContain('test_public_provider_config_contains_non_empty_player_choices');
    expect(tests).toContain('redact_key("sk-12345678") == "sk-1...5678"');
  });

  it('repairs stale Flask tests after player-supplied LLM keys become accepted', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-player-key-test-repair-'));
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'app.py'), [
      'from flask import Flask, jsonify, request',
      'app = Flask(__name__)',
      '@app.route("/start", methods=["POST"])',
      'def start_game():',
      '    body = request.get_json(silent=True) or {}',
      '    if body.get("mode") == "invalid_mode":',
      '        return jsonify({"error": "invalid_mode"}), 400',
      '    if not body.get("api_key"):',
      '        return jsonify({"error": "api_key_required"}), 400',
      '    return jsonify({"game_id": "game-1"})',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'llm_config.py'), [
      'def resolve_llm_config(payload, environ=None):',
      '    return {"ok": bool((payload or {}).get("api_key"))}',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'tests', 'test_app.py'), [
      'import pytest',
      '',
      '@pytest.fixture()',
      'def client():',
      '    from app import app',
      '    app.config.update(TESTING=True)',
      '    with app.test_client() as client:',
      '        yield client',
      '',
      'def test_start_invalid_mode_still_returns_400_with_player_key(client):',
      '    response = client.post("/start", json={"mode": "invalid_mode", "api_key": "test-key"})',
      '    assert response.status_code == 200',
      '    assert response.get_json()["error"] == "invalid_mode"',
      '',
      'def test_start_accepts_valid_speed_values(client):',
      '    response = client.post("/start", json={"mode": "m6", "speed": 0.1, "api_key": "test-key"})',
      '    assert response.status_code == 400',
      '    data = response.get_json()',
      '    assert data["error"] == "api_key_required", f"Expected api_key_required, got {data.get(\'error\')}"',
      '',
      '    response = client.post("/start", json={"mode": "m6", "speed": 3.0, "api_key": "test-key"})',
      '    assert response.status_code == 400',
      '    data = response.get_json()',
      '    assert data["error"] == "api_key_required"',
      '',
    ].join('\n'));

    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'player-key-test-repair',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Repair failed verification: python3 -m pytest tests/test_app.py -q',
        description: 'test_start_accepts_valid_speed_values expected api_key_required even though request supplies api_key',
        acceptance_criteria: ['tests reflect player-supplied API key acceptance'],
        expected_changed_files: ['tests/test_app.py'],
        verification_commands: ['python3 -m pytest tests/test_app.py -q'],
        priority: 'blocker',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    expect(result.changed_files).toEqual(['tests/test_app.py']);
    const tests = await fs.readFile(path.join(dir, 'tests', 'test_app.py'), 'utf8');
    expect(tests).toContain('assert response.status_code == 200');
    expect(tests).toContain('assert "game_id" in data');
    expect(tests).toContain('assert response.status_code == 400');
    expect(tests).toContain('assert response.get_json()["error"] == "invalid_mode"');
    expect(tests).not.toContain('Expected api_key_required');
  });

  it('repairs missing-key Flask tests that accidentally include a player API key', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-missing-key-test-repair-'));
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'app.py'), [
      'from flask import Flask, jsonify, request',
      'app = Flask(__name__)',
      '@app.route("/start", methods=["POST"])',
      'def start_game():',
      '    body = request.get_json(silent=True) or {}',
      '    if not body.get("api_key"):',
      '        return jsonify({"error": "missing_api_key"}), 400',
      '    return jsonify({"game_id": "game-1"})',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'llm_config.py'), [
      'def resolve_llm_config(payload, environ=None):',
      '    return {"ok": bool((payload or {}).get("api_key"))}',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'tests', 'test_app.py'), [
      'import pytest',
      '',
      '@pytest.fixture()',
      'def client():',
      '    from app import app',
      '    app.config.update(TESTING=True)',
      '    with app.test_client() as client:',
      '        yield client',
      '',
      'def test_start_rejects_missing_key(client):',
      '    response = client.post("/start", json={"mode": "m6", "api_key": "test-key"})',
      '    assert response.status_code == 400',
      '    assert response.get_json()["error"] == "missing_api_key"',
      '',
    ].join('\n'));

    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'missing-key-test-repair',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Repair failed verification: python3 -m pytest -q',
        description: 'test_start_rejects_missing_key got 200 because the test supplied api_key while asserting missing_api_key',
        acceptance_criteria: ['missing-key tests omit player API keys'],
        expected_changed_files: ['tests/test_app.py'],
        verification_commands: ['python3 -m pytest tests/test_app.py -q'],
        priority: 'blocker',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    expect(result.changed_files).toEqual(['tests/test_app.py']);
    const tests = await fs.readFile(path.join(dir, 'tests', 'test_app.py'), 'utf8');
    expect(tests).toContain('json={"mode": "m6"}');
    expect(tests).toContain('assert response.status_code == 400');
    expect(tests).not.toContain('"api_key": "test-key"');
  });

  it('keeps LLM config compatibility repair idempotent', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-llm-contract-idempotent-'));
    await fs.mkdir(path.join(dir, 'scripts'), { recursive: true });
    await fs.writeFile(path.join(dir, 'llm_config.py'), [
      'from __future__ import annotations',
      '',
      'import os',
      '',
      'def resolve_llm_config(payload, environ=None):',
      '    payload = payload or {}',
      '    if environ is None:',
      '        environ = os.environ',
      '    api_key = str(payload.get("api_key") or "").strip()',
      '    fallback_flag = (',
      '        os.environ.get("WW_ALLOW_SERVER_LLM_KEY_FALLBACK", "")',
      '        if environ is os.environ',
      '        else environ.get("WW_ALLOW_SERVER_LLM_KEY_FALLBACK", "")',
      '    )',
      '    allow_server_fallback = str(fallback_flag).lower() in {"1", "true", "yes", "on"}',
      '    if not api_key and allow_server_fallback:',
      '        if environ is os.environ:',
      '            api_key = os.environ.get("DEEPSEEK_API_KEY") or os.environ.get("OPENAI_API_KEY") or ""',
      '        else:',
      '            api_key = environ.get("DEEPSEEK_API_KEY") or environ.get("OPENAI_API_KEY") or ""',
      '    if not api_key:',
      '        return {"ok": False, "error": "api_key_required"}',
      '    return {"ok": True}',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'scripts', 'api_contract_check.py'), 'EXPECTED = "api_key_required"\n');
    await fs.writeFile(path.join(dir, 'scripts', 'config_contract_check.py'), 'EXPECTED = "WW_ALLOW_SERVER_LLM_KEY_FALLBACK"\n');

    const before = await fs.readFile(path.join(dir, 'llm_config.py'), 'utf8');
    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'llm-contract-idempotent',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Repair failing project verification',
        description: 'LLM config repair should not corrupt an already repaired env fallback block',
        acceptance_criteria: ['repair is idempotent'],
        expected_changed_files: ['llm_config.py'],
        verification_commands: ['python3 -m py_compile llm_config.py'],
        priority: 'blocker',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    await expect(fs.readFile(path.join(dir, 'llm_config.py'), 'utf8')).resolves.toBe(before);
  });

  it('repairs over-broad player-key validation status assertions after missing-key tests are gone', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-player-key-validation-repair-'));
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'app.py'), [
      'from flask import Flask, jsonify, request',
      'app = Flask(__name__)',
      '@app.route("/start", methods=["POST"])',
      'def start_game():',
      '    body = request.get_json(silent=True) or {}',
      '    if body.get("mode") == "invalid_mode":',
      '        return jsonify({"error": "invalid_mode"}), 400',
      '    return jsonify({"game_id": "game-1"})',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'llm_config.py'), 'def resolve_llm_config(payload, environ=None): return {"ok": bool((payload or {}).get("api_key"))}\n');
    await fs.writeFile(path.join(dir, 'tests', 'test_app.py'), [
      'import pytest',
      '',
      '@pytest.fixture()',
      'def client():',
      '    from app import app',
      '    app.config.update(TESTING=True)',
      '    with app.test_client() as client:',
      '        yield client',
      '',
      'def test_start_invalid_mode_returns_400(client):',
      '    response = client.post("/start", json={"mode": "invalid_mode", "api_key": "test-key"})',
      '    assert response.status_code == 200',
      '    assert response.get_json()["error"] == "invalid_mode"',
      '',
    ].join('\n'));

    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'player-key-validation-repair',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Repair failed verification: python3 -m pytest tests/test_app.py -q',
        description: 'validation tests were over-broadly changed to 200 after player-supplied key support',
        acceptance_criteria: ['validation errors still assert 400'],
        expected_changed_files: ['tests/test_app.py'],
        verification_commands: ['python3 -m pytest tests/test_app.py -q'],
        priority: 'blocker',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    const tests = await fs.readFile(path.join(dir, 'tests', 'test_app.py'), 'utf8');
    expect(tests).toContain('assert response.status_code == 400');
  });

  it('repairs API tests that pass while leaking background LLM authentication errors', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-bg-llm-auth-repair-'));
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'app.py'), [
      'import threading',
      'from flask import Flask, jsonify, request',
      'class GameMaster:',
      '    def run(self):',
      '        raise RuntimeError("network call should not run in API tests")',
      'app = Flask(__name__)',
      '@app.route("/start", methods=["POST"])',
      'def start_game():',
      '    body = request.get_json(silent=True) or {}',
      '    if not body.get("api_key"):',
      '        return jsonify({"error": "api_key_required"}), 400',
      '    game_id = "game-1"',
      '    def run_game():',
      '        GameMaster().run()',
      '    threading.Thread(target=run_game, daemon=True).start()',
      '    return jsonify({"game_id": game_id})',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'tests', 'test_app.py'), [
      'import pytest',
      '',
      '@pytest.fixture()',
      'def client():',
      '    from app import app',
      '    app.config.update(TESTING=True)',
      '    with app.test_client() as client:',
      '        yield client',
      '',
      'def test_start_accepts_valid_speed_values(client):',
      '    """Valid speed should be accepted with player key."""',
      '    response = client.post("/start", json={"mode": "m6", "speed": 0.1, "api_key": "test-key"})',
      '    assert response.status_code == 200',
      '    data = response.get_json()',
      '    assert "game_id" in data',
      '',
    ].join('\n'));

    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'bg-llm-auth-repair',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Repair failed verification: python3 -m pytest -q',
        description: 'pytest exited 0 but emitted game thread failed AuthenticationError',
        acceptance_criteria: ['API tests do not trigger background LLM calls'],
        expected_changed_files: ['tests/test_app.py'],
        verification_commands: ['python3 -m pytest tests/test_app.py -q'],
        priority: 'blocker',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    const tests = await fs.readFile(path.join(dir, 'tests', 'test_app.py'), 'utf8');
    expect(tests).toContain('def test_start_accepts_valid_speed_values(client, monkeypatch):');
    expect(tests).toContain('class _NoopThread:');
    expect(tests).toContain('monkeypatch.setattr("app.threading.Thread", _NoopThread)');
    expect(tests).toContain('monkeypatch.setattr("app.GameMaster.run", lambda self: None)');
    expect(tests.indexOf('monkeypatch.setattr("app.GameMaster.run"')).toBeLessThan(tests.indexOf('client.post("/start"'));
  });

  it('adds a UI product verification harness for pure UI demos', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-ui-product-'));
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      name: 'ui-demo',
      scripts: {
        dev: 'vite',
        build: 'vite build',
      },
      dependencies: {
        react: '^19.0.0',
        'react-dom': '^19.0.0',
        vite: '^6.0.0',
      },
    }, null, 2));
    await fs.writeFile(path.join(dir, 'index.html'), '<div id="root"></div><script type="module" src="/src/App.jsx"></script>\n');
    await fs.writeFile(path.join(dir, 'src', 'App.jsx'), [
      'import "./style.css";',
      'export default function App() {',
      '  return <main aria-label="Matrix console"><h1>MatrixOmnix</h1><button disabled={false}>Launch</button></main>;',
      '}',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'src', 'style.css'), [
      ':root { --accent: #38bdf8; font-family: Inter, sans-serif; }',
      'main { display: grid; gap: 16px; }',
      '@media (max-width: 640px) { main { padding: 12px; } }',
      'button:hover, button:focus-visible { outline: 2px solid var(--accent); }',
      '',
    ].join('\n'));

    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'ui1',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Add UI product verification harness',
        description: 'Pure UI demos need browser-level validation',
        acceptance_criteria: ['ui product check script exists', 'browser smoke scaffold exists'],
        expected_changed_files: ['scripts/ui-product-check.mjs', 'scripts/ui-render-smoke.mjs', 'playwright.config.ts', 'tests/ui/smoke.spec.ts', 'package.json'],
        verification_commands: ['node scripts/ui-product-check.mjs'],
        priority: 'high',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    expect(result.changed_files).toContain('scripts/ui-product-check.mjs');
    expect(result.changed_files).toContain('scripts/ui-render-smoke.mjs');
    expect(result.changed_files).toContain('tests/ui/smoke.spec.ts');
    expect(result.changed_files).toContain('playwright.config.ts');
    const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
    expect(pkg.scripts['ui:check']).toBe('node scripts/ui-product-check.mjs');
    expect(pkg.scripts['ui:render-check']).toBe('node scripts/ui-render-smoke.mjs');
    expect(pkg.scripts['ui:e2e']).toBe('playwright test');
    expect(pkg.devDependencies['@playwright/test']).toBeTruthy();
    const script = await fs.readFile(path.join(dir, 'scripts', 'ui-product-check.mjs'), 'utf8');
    expect(script).toContain('browser_harness');
    expect(script).toContain('runtime_render_harness');
    const renderScript = await fs.readFile(path.join(dir, 'scripts', 'ui-render-smoke.mjs'), 'utf8');
    expect(renderScript).toContain('chromium.launch');
    expect(renderScript).toContain('screenshot');
    const spec = await fs.readFile(path.join(dir, 'tests', 'ui', 'smoke.spec.ts'), 'utf8');
    expect(spec).toContain('horizontalOverflow');
    expect(spec).toContain('screenshot.byteLength');
  });

  it('adds missing build and test scripts when creating a UI product harness', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-ui-scripts-'));
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      name: 'ui-script-demo',
      private: true,
      type: 'module',
      dependencies: { vue: '^3.5.0' },
      scripts: { start: 'vite' },
    }, null, 2));
    await fs.writeFile(path.join(dir, 'index.html'), '<div id="app"></div><script type="module" src="/src/App.vue"></script>\n');
    await fs.writeFile(path.join(dir, 'src', 'App.vue'), [
      '<template>',
      '  <main aria-label="Demo app"><h1>Demo</h1><p>Loading state ready.</p></main>',
      '</template>',
      '<style>',
      'main { display: grid; gap: 1rem; }',
      '@media (max-width: 640px) { main { padding: 1rem; } }',
      '</style>',
      '',
    ].join('\n'));

    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'ui-scripts',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Add UI product verification harness',
        description: 'Pure UI demos need browser-level validation',
        acceptance_criteria: ['ui product check script exits 0'],
        expected_changed_files: ['scripts/ui-product-check.mjs', 'package.json', 'vite.config.js'],
        verification_commands: ['node scripts/ui-product-check.mjs'],
        priority: 'high',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
    expect(pkg.scripts.test).toBe('node scripts/ui-product-check.mjs');
    expect(pkg.scripts.build).toBe('node scripts/ui-product-check.mjs');
    expect(pkg.scripts['ui:check']).toBe('node scripts/ui-product-check.mjs');
    expect(pkg.devDependencies.vite).toBeTruthy();
    await expect(fs.readFile(path.join(dir, 'vite.config.js'), 'utf8')).resolves.toContain('defineConfig');
  });

  it('adds Vue UI product state surfaces during interaction hardening', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-ui-state-hardening-'));
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.writeFile(path.join(dir, 'src', 'App.vue'), [
      '<template>',
      '  <main>',
      '    <section id="about" class="flip" @mouseenter="flip = true" @mouseleave="flip = false">',
      '      <h1>Demo UI</h1>',
      '      <p>This is just a BETA.</p>',
      '    </section>',
      '  </main>',
      '</template>',
      '',
      '<script setup>',
      "import { ref } from 'vue';",
      'const flip = ref(false);',
      '</script>',
      '',
      '<style>',
      'body { cursor: none; }',
      'main { display: grid; }',
      '</style>',
      '',
    ].join('\n'));

    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'ui-state-hardening',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Harden UI interaction, accessibility and polish',
        description: 'Vue UI lacks keyboard/touch operation and explicit product states',
        acceptance_criteria: ['state surface exists', 'keyboard and touch handlers exist'],
        expected_changed_files: ['src/App.vue'],
        verification_commands: ['test -s src/App.vue'],
        priority: 'high',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    const app = await fs.readFile(path.join(dir, 'src', 'App.vue'), 'utf8');
    expect(app).toContain('role="status"');
    expect(app).toContain('errorMessage');
    expect(app).toContain('isEmpty');
    expect(app).toContain(':disabled="isLoading"');
    expect(app).toContain('@keydown.enter.prevent');
  });

  it('adds API, config, data and worker contract harnesses', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-contract-harnesses-'));
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      name: 'service-demo',
      scripts: {},
      dependencies: {
        express: '^5.0.0',
        prisma: '^6.0.0',
        bullmq: '^5.0.0',
      },
    }, null, 2));
    await fs.writeFile(path.join(dir, 'src', 'server.js'), [
      'import express from "express";',
      'import { Queue } from "bullmq";',
      'const app = express();',
      'app.get("/healthz", (_req, res) => res.json({ ok: true, token: process.env.SERVICE_TOKEN || "" }));',
      'export const queue = new Queue("jobs");',
      '',
    ].join('\n'));
    await fs.mkdir(path.join(dir, 'prisma'), { recursive: true });
    await fs.writeFile(path.join(dir, 'prisma', 'schema.prisma'), 'model Job { id String @id }\n');

    const executor = new RuleBasedExecutor();
    const base = {
      iteration_id: 'iter1',
      assigned_to: 'executor' as const,
      acceptance_criteria: ['contract exists'],
      priority: 'medium' as const,
      status: 'pending' as const,
    };
    const tasks = [
      ['api', 'Add API contract harness', ['docs/api-contract.md', 'scripts/api-contract-check.mjs', 'package.json'], 'node scripts/api-contract-check.mjs'],
      ['config', 'Add config contract harness', ['docs/config-contract.md', 'scripts/config-contract-check.mjs', '.env.example', 'package.json'], 'node scripts/config-contract-check.mjs'],
      ['data', 'Add data migration contract harness', ['docs/data-contract.md', 'scripts/data-contract-check.mjs', 'package.json'], 'node scripts/data-contract-check.mjs'],
      ['worker', 'Add worker contract harness', ['docs/worker-contract.md', 'scripts/worker-contract-check.mjs', 'package.json'], 'node scripts/worker-contract-check.mjs'],
    ] as const;

    for (const [id, title, expected, command] of tasks) {
      const result = await executor.runTask(
        {
          ...base,
          id,
          title,
          description: title,
          expected_changed_files: [...expected],
          verification_commands: [command],
        },
        { project_path: dir, iteration_id: 'iter1', recent_events: [] },
      );
      expect(result.status).toBe('completed');
      expect(result.verification_evidence.every((e) => e.passed)).toBe(true);
    }

    const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
    expect(pkg.scripts['api:contract-check']).toBe('node scripts/api-contract-check.mjs');
    expect(pkg.scripts['config:contract-check']).toBe('node scripts/config-contract-check.mjs');
    expect(pkg.scripts['data:contract-check']).toBe('node scripts/data-contract-check.mjs');
    expect(pkg.scripts['worker:contract-check']).toBe('node scripts/worker-contract-check.mjs');
    expect(await fs.readFile(path.join(dir, '.env.example'), 'utf8')).toContain('SERVICE_TOKEN=');
  });

  it('keeps config contract harness valid when no env vars remain after earlier repairs', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-config-no-env-'));
    await fs.writeFile(path.join(dir, 'app.py'), 'def ok():\n    return True\n');

    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'config-no-env',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Add config contract harness',
        description: 'Config harness should explicitly pass when no env vars remain',
        acceptance_criteria: ['config contract exists'],
        expected_changed_files: ['docs/config-contract.md', 'scripts/config-contract-check.mjs', '.env.example', 'package.json'],
        verification_commands: ['node scripts/config-contract-check.mjs'],
        priority: 'medium',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    expect(result.changed_files).toContain('.env.example');
    expect(await fs.readFile(path.join(dir, '.env.example'), 'utf8')).toContain('# Runtime configuration');
    expect(result.verification_evidence.every((e) => e.passed)).toBe(true);
  });

  it('adds a generalized surface contract matrix for specialized demo surfaces', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-surface-contract-'));
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify({
      manifest_version: 3,
      name: 'Extension Demo',
      version: '0.1.0',
      action: { default_popup: 'popup.html' },
    }, null, 2));
    await fs.writeFile(path.join(dir, 'popup.html'), '<button id="run">Run</button><script src="src/popup.js"></script>\n');
    await fs.writeFile(path.join(dir, 'src', 'popup.js'), 'document.getElementById("run").addEventListener("click", () => console.log("demo"));\n');

    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'surface-contract',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Add demo surface contract matrix',
        description: 'Specialized demo surfaces need a productization map',
        acceptance_criteria: ['surface contract matrix exists'],
        expected_changed_files: ['docs/productization-surface-map.md', 'scripts/surface-contract-check.mjs', 'package.json'],
        verification_commands: ['node scripts/surface-contract-check.mjs'],
        priority: 'medium',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    expect(result.changed_files).toContain('docs/productization-surface-map.md');
    expect(result.changed_files).toContain('scripts/surface-contract-check.mjs');
    expect(result.changed_files).toContain('package.json');
    const doc = await fs.readFile(path.join(dir, 'docs', 'productization-surface-map.md'), 'utf8');
    expect(doc).toContain('browser_extension');
    const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
    expect(pkg.scripts['surface:contract-check']).toBe('node scripts/surface-contract-check.mjs');
  });

  it('adds dedicated contract harnesses for extension, notebook, mobile and desktop demos', async () => {
    const executor = new RuleBasedExecutor();
    const cases = [
      {
        prefix: 'extension',
        title: 'Add browser extension contract harness',
        command: 'node scripts/browser-extension-contract-check.mjs',
        docs: 'docs/browser-extension-contract.md',
        script: 'scripts/browser-extension-contract-check.mjs',
        scriptKey: 'extension:contract-check',
        setup: async (dir: string) => {
          await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify({
            manifest_version: 3,
            name: 'Extension Demo',
            version: '0.1.0',
            action: { default_popup: 'popup.html' },
          }, null, 2));
          await fs.writeFile(path.join(dir, 'popup.html'), '<main>Popup</main>\n');
        },
      },
      {
        prefix: 'notebook',
        title: 'Add notebook reproducibility contract harness',
        command: 'node scripts/notebook-contract-check.mjs',
        docs: 'docs/notebook-contract.md',
        script: 'scripts/notebook-contract-check.mjs',
        scriptKey: 'notebook:contract-check',
        setup: async (dir: string) => {
          await fs.writeFile(path.join(dir, 'analysis.ipynb'), JSON.stringify({ cells: [], metadata: {}, nbformat: 4, nbformat_minor: 5 }, null, 2));
        },
      },
      {
        prefix: 'mobile',
        title: 'Add mobile app contract harness',
        command: 'node scripts/mobile-contract-check.mjs',
        docs: 'docs/mobile-contract.md',
        script: 'scripts/mobile-contract-check.mjs',
        scriptKey: 'mobile:contract-check',
        setup: async (dir: string) => {
          await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { expo: '^54.0.0' } }, null, 2));
          await fs.writeFile(path.join(dir, 'app.json'), JSON.stringify({ expo: { name: 'Mobile Demo', slug: 'mobile-demo' } }, null, 2));
        },
      },
      {
        prefix: 'desktop',
        title: 'Add desktop app contract harness',
        command: 'node scripts/desktop-contract-check.mjs',
        docs: 'docs/desktop-contract.md',
        script: 'scripts/desktop-contract-check.mjs',
        scriptKey: 'desktop:contract-check',
        setup: async (dir: string) => {
          await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { electron: '^39.0.0' } }, null, 2));
          await fs.writeFile(path.join(dir, 'electron.js'), 'console.log("desktop shell");\n');
        },
      },
    ];

    for (const c of cases) {
      const dir = await fs.mkdtemp(path.join(tmpdir(), `d2p-rbe-${c.prefix}-contract-`));
      await c.setup(dir);
      const result = await executor.runTask(
        {
          id: `${c.prefix}-contract`,
          iteration_id: 'iter1',
          assigned_to: 'executor',
          title: c.title,
          description: c.title,
          acceptance_criteria: ['contract harness exists'],
          expected_changed_files: [c.docs, c.script, 'package.json'],
          verification_commands: [c.command],
          priority: 'medium',
          status: 'pending',
        },
        { project_path: dir, iteration_id: 'iter1', recent_events: [] },
      );

      expect(result.status).toBe('completed');
      expect(result.verification_evidence.every((e) => e.passed)).toBe(true);
      expect(result.changed_files).toContain(c.docs);
      expect(result.changed_files).toContain(c.script);
      const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
      expect(pkg.scripts[c.scriptKey]).toBe(c.command);
    }
  });

  it('adds dedicated contract harnesses for game, 3D, ML and media demos', async () => {
    const executor = new RuleBasedExecutor();
    const cases = [
      {
        prefix: 'game',
        title: 'Add game runtime contract harness',
        command: 'node scripts/game-contract-check.mjs',
        docs: 'docs/game-contract.md',
        script: 'scripts/game-contract-check.mjs',
        scriptKey: 'game:contract-check',
        setup: async (dir: string) => {
          await fs.mkdir(path.join(dir, 'src'), { recursive: true });
          await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { phaser: '^3.90.0' } }, null, 2));
          await fs.writeFile(path.join(dir, 'src', 'game.js'), 'const game = new Phaser.Game({ scene });\nrequestAnimationFrame(() => game.step?.());\n');
        },
      },
      {
        prefix: '3d',
        title: 'Add 3D scene contract harness',
        command: 'node scripts/3d-scene-contract-check.mjs',
        docs: 'docs/3d-scene-contract.md',
        script: 'scripts/3d-scene-contract-check.mjs',
        scriptKey: '3d:contract-check',
        setup: async (dir: string) => {
          await fs.mkdir(path.join(dir, 'src'), { recursive: true });
          await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { three: '^0.180.0' } }, null, 2));
          await fs.writeFile(path.join(dir, 'src', 'scene.js'), 'const renderer = new THREE.WebGLRenderer();\nrenderer.setAnimationLoop(render);\n');
        },
      },
      {
        prefix: 'ml',
        title: 'Add ML model contract harness',
        command: 'node scripts/ml-model-contract-check.mjs',
        docs: 'docs/ml-model-contract.md',
        script: 'scripts/ml-model-contract-check.mjs',
        scriptKey: 'ml:contract-check',
        setup: async (dir: string) => {
          await fs.mkdir(path.join(dir, 'src'), { recursive: true });
          await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { 'onnxruntime-web': '^1.23.0' } }, null, 2));
          await fs.writeFile(path.join(dir, 'src', 'model.js'), 'const session = await ort.InferenceSession.create("model.onnx");\n');
          await fs.writeFile(path.join(dir, 'model.onnx'), 'demo-model');
        },
      },
      {
        prefix: 'media',
        title: 'Add media pipeline contract harness',
        command: 'node scripts/media-pipeline-contract-check.mjs',
        docs: 'docs/media-pipeline-contract.md',
        script: 'scripts/media-pipeline-contract-check.mjs',
        scriptKey: 'media:contract-check',
        setup: async (dir: string) => {
          await fs.mkdir(path.join(dir, 'src'), { recursive: true });
          await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { sharp: '^0.34.0' } }, null, 2));
          await fs.writeFile(path.join(dir, 'src', 'process-media.js'), 'await sharp(input).resize(256).toFile(output);\n');
        },
      },
    ];

    for (const c of cases) {
      const dir = await fs.mkdtemp(path.join(tmpdir(), `d2p-rbe-${c.prefix}-contract-`));
      await c.setup(dir);
      const result = await executor.runTask(
        {
          id: `${c.prefix}-contract`,
          iteration_id: 'iter1',
          assigned_to: 'executor',
          title: c.title,
          description: c.title,
          acceptance_criteria: ['contract harness exists'],
          expected_changed_files: [c.docs, c.script, 'package.json'],
          verification_commands: [c.command],
          priority: 'medium',
          status: 'pending',
        },
        { project_path: dir, iteration_id: 'iter1', recent_events: [] },
      );

      expect(result.status).toBe('completed');
      expect(result.verification_evidence.every((e) => e.passed)).toBe(true);
      expect(result.changed_files).toContain(c.docs);
      expect(result.changed_files).toContain(c.script);
      const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
      expect(pkg.scripts[c.scriptKey]).toBe(c.command);
    }
  });

  it('adds runnable product entries for visual and mobile specialized demos', async () => {
    const executor = new RuleBasedExecutor();
    const gameDir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-game-runtime-'));
    await fs.mkdir(path.join(gameDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(gameDir, 'package.json'), JSON.stringify({
      name: 'game-runtime-demo',
      type: 'module',
      dependencies: { phaser: '^3.90.0' },
      scripts: {
        test: 'node --test',
        build: 'node --check src/product-core.mjs',
      },
    }, null, 2));
    await fs.writeFile(path.join(gameDir, 'src', 'game.js'), 'new Phaser.Game({ scene: { create() {} } });\n');

    const gameResult = await executor.runTask(
      {
        id: 'game-runtime',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Add product runtime entry',
        description: 'Specialized product surface has no runnable entry',
        acceptance_criteria: ['start script launches the game surface'],
        expected_changed_files: ['index.html', 'src/product-runtime.mjs', 'scripts/product-runtime-check.mjs', 'package.json'],
        verification_commands: ['node scripts/product-runtime-check.mjs'],
        priority: 'high',
        status: 'pending',
      },
      { project_path: gameDir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(gameResult.status).toBe('completed');
    expect(gameResult.changed_files).toContain('index.html');
    expect(gameResult.changed_files).toContain('src/product-runtime.mjs');
    expect(gameResult.changed_files).toContain('scripts/product-runtime-check.mjs');
    const gamePkg = JSON.parse(await fs.readFile(path.join(gameDir, 'package.json'), 'utf8'));
    expect(gamePkg.scripts.start).toContain('vite');
    expect(gamePkg.devDependencies.vite).toBeTruthy();
    expect(await fs.readFile(path.join(gameDir, 'src', 'product-runtime.mjs'), 'utf8')).toContain('globalThis.Phaser');
    expect(gameResult.verification_evidence.every((e) => e.passed)).toBe(true);

    const mobileDir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-mobile-runtime-'));
    await fs.writeFile(path.join(mobileDir, 'app.json'), JSON.stringify({ expo: { name: 'Mobile Demo', slug: 'mobile-demo' } }, null, 2));
    await fs.writeFile(path.join(mobileDir, 'package.json'), JSON.stringify({
      name: 'mobile-runtime-demo',
      dependencies: { expo: '^54.0.0', 'react-native': '^0.81.0' },
      scripts: { test: 'node --test', build: 'node --check src/product-core.mjs' },
    }, null, 2));

    const mobileResult = await executor.runTask(
      {
        id: 'mobile-runtime',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Add product runtime entry',
        description: 'Mobile product surface has no runnable entry',
        acceptance_criteria: ['start script launches Expo'],
        expected_changed_files: ['App.js', 'scripts/product-runtime-check.mjs', 'package.json'],
        verification_commands: ['node scripts/product-runtime-check.mjs'],
        priority: 'high',
        status: 'pending',
      },
      { project_path: mobileDir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(mobileResult.status).toBe('completed');
    expect(mobileResult.changed_files).toContain('App.js');
    const mobilePkg = JSON.parse(await fs.readFile(path.join(mobileDir, 'package.json'), 'utf8'));
    expect(mobilePkg.scripts.start).toBe('expo start');
    expect(await fs.readFile(path.join(mobileDir, 'App.js'), 'utf8')).toContain('react-native');
    expect(mobileResult.verification_evidence.every((e) => e.passed)).toBe(true);
  });

  it('adds runnable CLI product entries for ML and media pipeline demos', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-pipeline-runtime-'));
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.mkdir(path.join(dir, 'scripts'), { recursive: true });
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      name: 'pipeline-runtime-demo',
      type: 'module',
      dependencies: { sharp: '^0.34.0' },
      scripts: {
        test: 'node --test',
        build: 'node --check src/product-core.mjs',
      },
    }, null, 2));
    await fs.writeFile(path.join(dir, 'src', 'process-media.js'), 'import sharp from "sharp"; export async function resize(input, output) { return sharp(input).resize(128).toFile(output); }\n');
    await fs.writeFile(path.join(dir, 'src', 'product-core.mjs'), 'export function runWorkflow(name = "status") { return { ok: true, name }; }\n');
    await fs.writeFile(path.join(dir, 'scripts', 'surface-contract-check.mjs'), 'const detectorPattern = /THREE\\.WebGLRenderer|SceneLoader|webgl/;\nconsole.log(detectorPattern);\n');

    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'pipeline-runtime',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Add product runtime entry',
        description: 'ML/media product surface has no runnable entry',
        acceptance_criteria: ['bin/product.js runs the product core'],
        expected_changed_files: ['bin/product.js', 'scripts/product-runtime-check.mjs', 'package.json'],
        verification_commands: ['node scripts/product-runtime-check.mjs'],
        priority: 'high',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    expect(result.changed_files).toContain('bin/product.js');
    const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
    expect(pkg.bin['pipeline-runtime-demo']).toBe('./bin/product.js');
    expect(pkg.scripts.start).toContain('bin/product.js');
    expect(await fs.readFile(path.join(dir, 'bin', 'product.js'), 'utf8')).toContain('runWorkflow');
    expect(result.verification_evidence.every((e) => e.passed)).toBe(true);
  });

  it('keeps Python validation scripts when adding cross-runtime contract harnesses', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-python-contract-harness-'));
    await fs.writeFile(path.join(dir, 'app.py'), [
      'import os',
      'from flask import Flask, jsonify',
      'app = Flask(__name__)',
      '@app.route("/healthz")',
      'def healthz():',
      '    return jsonify({"token": os.environ.get("SERVICE_TOKEN", "")})',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask>=3.0.0\n');

    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'api-python',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Add API contract harness',
        description: 'Python API needs a contract harness',
        acceptance_criteria: ['api contract exists'],
        expected_changed_files: ['docs/api-contract.md', 'scripts/api-contract-check.mjs', 'package.json'],
        verification_commands: ['node scripts/api-contract-check.mjs'],
        priority: 'high',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
    expect(pkg.scripts.test).toBe('python3 -m pytest -q');
    expect(pkg.scripts.build).toContain('ast.parse');
    expect(pkg.scripts['api:contract-check']).toBe('node scripts/api-contract-check.mjs');
  });

  it('hardens common UI interaction, accessibility and polish issues', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-ui-hardening-'));
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.mkdir(path.join(dir, 'example'), { recursive: true });
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      name: 'matrixomnix',
      scripts: { build: 'node -e "console.log(\'build ok\')"' },
    }, null, 2));
    await fs.writeFile(path.join(dir, 'src', 'App.vue'), [
      '<template>',
      '  <nav class="nav"><a href="#about">About</a></nav>',
      '  <section class="panel flip-panel" id="about" @mouseenter="flipOn(\'about\')" @mouseleave="flipOff(\'about\')">',
      '    <p>Welcome to my website.</p>',
      '  </section>',
      '  <section class="flip" id="service" @mouseenter="service = true" @mouseleave="service = false">',
      '    <p>This is just a BETA.</p>',
      '  </section>',
      '</template>',
      '<script setup>',
      "import { onMounted, ref } from 'vue'",
      'const cursorX = ref(window.innerWidth / 2)',
      'const cursorY = ref(window.innerHeight / 2)',
      'onMounted(() => {',
      '  const update = (clientX, clientY) => {',
      '    cursorX.value = clientX',
      '    cursorY.value = clientY',
      '  }',
      '  const onMove = (event) => {',
      '    update(event.clientX, event.clientY)',
      '  }',
      '  document.addEventListener(\'mousemove\', onMove, { passive: true })',
      "  document.body.style.cursor = 'none'",
      '  cleanup = () => {',
      '    document.removeEventListener(\'mousemove\', onMove)',
      '  }',
      '})',
      '</script>',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'src', 'style.css'), [
      'body { cursor: none; overflow-x: hidden; }',
      '.topbar { position: sticky; top: 0; }',
      '.brand { letter-spacing: 0.22em; }',
      '.hero-title__name { font-size: 7.25rem; }',
      '.cursor-core { width: 168px; }',
      '.cursor-core { width: 168px; }',
      '.eyebrow,',
      '.subcopy { margin: 0; }',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'example', 'index.html'), '<section class="panel flip-panel" id="about" data-flip-panel><p>Panel</p></section>\n');
    await fs.writeFile(path.join(dir, 'example', 'script.js'), [
      'const flipPanels = document.querySelectorAll("[data-flip-panel]");',
      'function flipPanel(panel) { panel.classList.add("flipped"); }',
      'function unflipPanel(panel) { panel.classList.remove("flipped"); }',
      'flipPanels.forEach((panel) => {',
      '  panel.addEventListener("mouseenter", () => flipPanel(panel));',
      '  panel.addEventListener("mouseleave", () => unflipPanel(panel));',
      '  panel.addEventListener("focusin", () => flipPanel(panel));',
      '  panel.addEventListener("focusout", () => unflipPanel(panel));',
      '});',
      '',
    ].join('\n'));

    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'ui-hardening',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Harden UI interaction, accessibility and polish',
        description: 'Common UI hardening',
        acceptance_criteria: ['keyboard and touch paths exist'],
        expected_changed_files: ['src', 'example'],
        verification_commands: ['node -e "console.log(\'verified\')"'],
        priority: 'high',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    expect(result.changed_files).toContain('src/App.vue');
    expect(result.changed_files).toContain('src/style.css');
    expect(result.changed_files).toContain('example/index.html');
    expect(result.changed_files).toContain('example/script.js');
    const app = await fs.readFile(path.join(dir, 'src', 'App.vue'), 'utf8');
    expect(app).toContain('aria-label="Primary navigation"');
    expect(app).toContain('tabindex="0"');
    expect(app).toContain('@focus="flipOn(\'about\')"');
    expect(app).toContain('@touchstart.passive="flipOn(\'about\')"');
    expect(app).toContain('@focus="service = true"');
    expect(app).toContain('@blur="service = false"');
    expect(app).toContain('@touchstart.passive="service = true"');
    expect(app).toContain('@keydown.enter.prevent="service = true"');
    expect(app).toContain('const scheduleUpdate =');
    expect(app).toContain('requestAnimationFrame');
    expect(app).not.toContain("document.body.style.cursor = 'none'");
    expect(app).not.toContain('Welcome to my website');
    expect(app).toContain('Explore the core work, services and contact paths');
    const css = await fs.readFile(path.join(dir, 'src', 'style.css'), 'utf8');
    expect(css).toContain('cursor: auto;');
    expect(css).toContain('scroll-margin-top');
    expect(css).toContain('font-size: clamp(3.5rem, 12vw, 7.25rem);');
    expect(css).toContain('letter-spacing: 0;');
    expect(css).not.toContain('.cursor-capture,\n\n.cursor-capture');
    expect(css.match(/\\.cursor-core \\{ width: 168px; \\}/g)?.length ?? 0).toBeLessThanOrEqual(1);
    expect(css).not.toContain('.eyebrow,');
    const html = await fs.readFile(path.join(dir, 'example', 'index.html'), 'utf8');
    expect(html).toContain('tabindex="0"');
    const script = await fs.readFile(path.join(dir, 'example', 'script.js'), 'utf8');
    expect(script).toContain('touchstart');
    expect(script).toContain('keydown');
  });

  it('aligns unimplemented hosted service claims with beta local usage', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-ui-service-claim-'));
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      name: 'service-claim-demo',
      scripts: { build: 'node -e "console.log(\'build ok\')"' },
    }, null, 2));
    await fs.writeFile(path.join(dir, 'src', 'App.vue'), [
      '<template>',
      '  <main>',
      '    <h1>Upload a demo. Receive a product zip.</h1>',
      '    <form class="upload-panel" data-upload-form data-return-format="zip">',
      '      <input type="file" data-demo-upload accept=".zip,.7z,.rar,.tar,.tar.gz,.tgz" />',
      '      <p>MatrixOmnix will process the archive and return a productized zip artifact.</p>',
      '    </form>',
      '  </main>',
      '</template>',
      '',
    ].join('\n'));

    const result = await new RuleBasedExecutor().runTask(
      {
        id: 'ui-service-claim',
        iteration_id: 'iter1',
        assigned_to: 'executor',
        title: 'Align UI service claims with implemented backend',
        description: 'UI promises hosted upload and artifact return without a backend',
        acceptance_criteria: ['hosted upload claims are removed'],
        expected_changed_files: ['src'],
        verification_commands: ['node -e "console.log(\'verified\')"'],
        priority: 'high',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'iter1', recent_events: [] },
    );

    expect(result.status).toBe('completed');
    expect(result.changed_files).toContain('src/App.vue');
    const app = await fs.readFile(path.join(dir, 'src', 'App.vue'), 'utf8');
    expect(app).toContain('How to use MatrixOmnix beta.');
    expect(app).toContain('data-service-guide');
    expect(app).toContain('not a hosted file-processing service yet');
    expect(app).not.toContain('data-upload-form');
    expect(app).not.toContain('data-demo-upload');
    expect(app).not.toContain('type="file"');
    expect(app).not.toContain('Receive a product zip');
  });
});
