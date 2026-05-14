import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { SupervisorAgent } from '../src/agents/SupervisorAgent.js';
import { MockAgentProvider } from '../src/agents/providers/MockAgentProvider.js';
import { RuleBasedExecutor } from '../src/agents/providers/RuleBasedExecutor.js';
import { AnalyzerAgent } from '../src/agents/AnalyzerAgent.js';

async function tmpDemo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-sup-'));
  await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'demo', main: 'app.js' }, null, 2));
  await fs.writeFile(path.join(dir, 'app.js'), 'console.log("hi");\n');
  return dir;
}

describe('SupervisorAgent.iterate', () => {
  let demo: string;
  beforeEach(async () => { demo = await tmpDemo(); });

  it('runs a single iteration and produces a summary with before/after scores', async () => {
    const sup = new SupervisorAgent();
    const summaries = await sup.iterate({
      projectPath: demo,
      goal: 'project-ready',
      provider: new MockAgentProvider('happy'),
      maxIterations: 1,
    });
    expect(summaries.length).toBe(1);
    const s = summaries[0]!;
    expect(s.assigned_tasks.length).toBeGreaterThan(0);
    expect(s.executor_results.length).toBe(s.assigned_tasks.length);
    expect(s.project_score_before.total).toBeGreaterThanOrEqual(0);
    expect(s.project_score_after.total).toBeGreaterThanOrEqual(0);
  });

  it('refuses to mark a change-without-verify task as completed', async () => {
    const sup = new SupervisorAgent();
    const summaries = await sup.iterate({
      projectPath: demo,
      goal: 'project-ready',
      provider: new MockAgentProvider('change_without_verify'),
      maxIterations: 1,
    });
    const s = summaries[0]!;
    const completed = s.executor_results.filter((r) => r.status === 'completed');
    expect(completed.length).toBe(0);
    expect(s.qa_cases_created_or_updated.length).toBeGreaterThan(0);
    expect(s.reviewer_findings.some((f) => /missing_validation_after_code_change/.test(f))).toBe(true);
  });

  it('accepts change_with_unable_reason as a documented non-verification', async () => {
    const sup = new SupervisorAgent();
    const summaries = await sup.iterate({
      projectPath: demo,
      goal: 'project-ready',
      provider: new MockAgentProvider('change_with_unable_reason'),
      maxIterations: 1,
    });
    const s = summaries[0]!;
    const flagged = s.reviewer_findings.filter((f) => /missing_validation_after_code_change/.test(f));
    expect(flagged.length).toBe(0);
  });

  it('stops when rule-based fixes clear all gap findings', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-sup-py-'));
    await fs.mkdir(path.join(dir, '.github', 'workflows'), { recursive: true });
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.writeFile(path.join(dir, 'README.md'), '# Python Demo\n\n' + 'x'.repeat(420));
    await fs.writeFile(path.join(dir, '.gitignore'), '.env\n');
    await fs.writeFile(path.join(dir, '.env.example'), 'LOG_LEVEL=info\n');
    await fs.writeFile(path.join(dir, 'src', '.gitkeep'), '');
    await fs.writeFile(path.join(dir, 'app.py'), 'print("hi")\n');
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'openai>=1.0.0\n');
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      scripts: {
        test: 'node --test tests',
        build: 'node -e "console.log(\'build ok\')"',
      },
    }));
    await fs.writeFile(path.join(dir, 'tsconfig.json'), '{}');
    await fs.writeFile(path.join(dir, '.github', 'workflows', 'ci.yml'), 'name: CI\njobs:\n  test:\n    steps:\n      - run: npm test\n');

    const summaries = await new SupervisorAgent().iterate({
      projectPath: dir,
      goal: 'project-ready with minimal wasted iterations',
      provider: new RuleBasedExecutor(),
      maxIterations: 10,
    });

    expect(summaries.length).toBeGreaterThan(0);
    expect(summaries.length).toBeLessThanOrEqual(10);
    expect(summaries.flatMap((s) => s.verification_results).every((r) => r.passed)).toBe(true);
    const after = await new AnalyzerAgent().fullAnalyzeWithEvidence(dir, { runCommands: true });
    expect(after.gap.findings).toHaveLength(0);
  });

  it('plans repair work from failing verification evidence', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-sup-red-tests-'));
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.mkdir(path.join(dir, '.github', 'workflows'), { recursive: true });
    await fs.writeFile(path.join(dir, 'README.md'), '# Flask Demo\n\nDocker gunicorn healthz\n' + 'x'.repeat(500));
    await fs.writeFile(path.join(dir, '.gitignore'), '.env\n');
    await fs.writeFile(path.join(dir, '.env.example'), 'DEEPSEEK_API_KEY=\nMAX_ACTIVE_GAMES=3\n');
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask>=3.0.0\npytest>=8.0\ngunicorn>=22.0.0\n');
    await fs.writeFile(path.join(dir, 'pyproject.toml'), '[project]\nname = "flask-demo"\n');
    await fs.writeFile(path.join(dir, 'Dockerfile'), 'FROM python:3.11-slim\nHEALTHCHECK CMD curl http://127.0.0.1:5001/healthz\n');
    await fs.writeFile(path.join(dir, 'wsgi.py'), 'from app import app\n');
    await fs.writeFile(path.join(dir, '.github', 'workflows', 'ci.yml'), 'name: CI\njobs:\n  test:\n    steps:\n      - run: python3 -m pytest -q\n');
    await fs.writeFile(path.join(dir, 'config.py'), [
      'import os',
      '',
      'def require_api_key():',
      '    return bool(os.environ.get("DEEPSEEK_API_KEY")), "missing key"',
      '',
      'def max_active_games():',
      '    return max(1, int(os.environ.get("MAX_ACTIVE_GAMES", "3")))',
      '',
    ].join('\n'));
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
      'def test_security_headers_present(client):',
      '    response = client.get("/healthz")',
      '    assert response.headers["X-Content-Type-Options"] == "nosniff"',
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
      '    assert response.get_json()["error"] == "too_many_active_games"',
      '',
    ].join('\n'));

    const summaries = await new SupervisorAgent().iterate({
      projectPath: dir,
      goal: 'repair red verification',
      provider: new RuleBasedExecutor(),
      maxIterations: 1,
    });

    expect(summaries[0]!.assigned_tasks.map((t) => t.title)).toContain('Repair failing project verification');
    expect(summaries[0]!.verification_results.every((r) => r.passed)).toBe(true);
  });
});
