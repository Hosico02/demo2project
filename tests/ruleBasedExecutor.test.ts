import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { RuleBasedExecutor } from '../src/agents/providers/RuleBasedExecutor.js';
import { SupervisorAgent } from '../src/agents/SupervisorAgent.js';

async function tmpDemo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-'));
  await fs.writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'rbe-demo', main: 'app.js' }, null, 2),
  );
  await fs.writeFile(path.join(dir, 'app.js'), 'console.log("hi");\n');
  return dir;
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
        title: 'Repair failing project verification',
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

  it('adds Python dependency constraints and install docs', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-rbe-python-deps-'));
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'README.md'), '# Demo\n\n## Install\n\npip install -r requirements.txt\n');
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask>=3.0.0\nopenai>=1.0.0\npytest>=8.0.0\n');
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
