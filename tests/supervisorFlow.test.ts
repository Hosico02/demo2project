import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { SupervisorAgent, shouldSkipAdvisoryForMechanicalCloseout } from '../src/agents/SupervisorAgent.js';
import { MockAgentProvider } from '../src/agents/providers/MockAgentProvider.js';
import { RuleBasedExecutor } from '../src/agents/providers/RuleBasedExecutor.js';
import { AnalyzerAgent } from '../src/agents/AnalyzerAgent.js';
import { loadOfficialModelCatalog } from '../src/research/OfficialModelCatalog.js';
import { MockAdvisoryProvider } from '../src/agents/advisory/MockAdvisoryProvider.js';
import { loadMarketResearchReport } from '../src/research/MarketResearchAgent.js';
import type { SearchProvider } from '../src/research/SearchProvider.js';
import type { MarketResearchReport } from '../src/research/types.js';

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

  it('refreshes the official LLM model catalog before planning when iteration web opt-in is enabled', async () => {
    await fs.writeFile(path.join(demo, 'requirements.txt'), 'openai>=1.0.0\nflask>=3.0.0\n');
    await fs.writeFile(path.join(demo, 'llm_config.py'), [
      'PROVIDER_PRESETS = {"deepseek": {"default_model": "deepseek-chat"}}',
      'def public_provider_config():',
      '    return {"providers": [{"id": "deepseek", "label": "DeepSeek", "default_model": "deepseek-chat"}]}',
      '',
    ].join('\n'));
    const fetchedUrls: string[] = [];
    const fetchImpl = async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      fetchedUrls.push(url);
      const body = url.includes('deepseek')
        ? 'deepseek-v4-flash deepseek-v4-pro deepseek-v4-ultra'
        : url.includes('minimax')
          ? 'MiniMax-M2.7 MiniMax-M2.7-highspeed MiniMax-M9.9'
          : url.includes('alibabacloud')
            ? 'qwen3.6-plus qwen3.6-max-preview qwen9.9-plus'
            : 'gpt-5.4-mini gpt-5.5 gpt-9.9-mini';
      return {
        ok: true,
        status: 200,
        text: async () => body,
      } as Response;
    };

    await new SupervisorAgent().iterate({
      projectPath: demo,
      goal: 'project-ready with current provider model choices',
      provider: new MockAgentProvider('happy'),
      maxIterations: 1,
      officialModelCatalog: {
        allowNetwork: true,
        fetchImpl,
      },
    });

    const catalog = await loadOfficialModelCatalog(demo);
    expect(fetchedUrls.length).toBeGreaterThanOrEqual(4);
    expect(catalog?.providers.find((provider) => provider.id === 'minimax')?.models).toContain('MiniMax-M9.9');
    expect(catalog?.providers.find((provider) => provider.id === 'qwen')?.models).toContain('qwen9.9-plus');
    expect(catalog?.providers.find((provider) => provider.id === 'openai')?.models).toContain('gpt-9.9-mini');
    expect(catalog?.providers.filter((provider) => provider.source_kind === 'live_official_docs').length).toBeGreaterThanOrEqual(4);
  });

  it('does not refresh LLM model docs for non-LLM projects even when iteration web opt-in is enabled', async () => {
    let fetchCount = 0;
    const fetchImpl = async (): Promise<Response> => {
      fetchCount++;
      return {
        ok: true,
        status: 200,
        text: async () => 'gpt-9.9-mini',
      } as Response;
    };

    await new SupervisorAgent().iterate({
      projectPath: demo,
      goal: 'project-ready without unrelated model research',
      provider: new MockAgentProvider('happy'),
      maxIterations: 1,
      officialModelCatalog: {
        allowNetwork: true,
        fetchImpl,
      },
    });

    expect(fetchCount).toBe(0);
    await expect(loadOfficialModelCatalog(demo)).resolves.toBeNull();
  });

  it('runs advisory agents before planning and includes source-backed proposals as normal tasks', async () => {
    const provider = new MockAdvisoryProvider({
      task_proposals: [{
        title: 'Implement competitor-informed onboarding flow',
        description: 'Add a real first-run workflow identified by market comparison.',
        acceptance_criteria: ['first-run workflow is reachable', 'test covers first-run workflow'],
        expected_changed_files: ['src/onboarding.js', 'tests/onboarding.test.js'],
        verification_commands: ['npm test -- onboarding'],
        priority: 'high',
        confidence: 'high',
        source_urls: ['https://example.com/mature-product-onboarding'],
      }],
    });

    const summaries = await new SupervisorAgent().iterate({
      projectPath: demo,
      goal: 'project-ready with model-backed advisory agents',
      provider: new MockAgentProvider('happy'),
      maxIterations: 1,
      advisory: {
        provider,
        roles: ['planner_critic'],
        allowNetwork: true,
      },
    });

    const summary = summaries[0]!;
    expect(summary.gap_report.advisory_reports?.[0]?.role).toBe('planner_critic');
    expect(summary.iteration_plan.advisory_focus).toContain('planner_critic: Implement competitor-informed onboarding flow');
    expect(summary.assigned_tasks.map((task) => task.title)).toContain('Implement competitor-informed onboarding flow');
  });

  it('skips model advisory for deterministic deployment and documentation closeout gaps', () => {
    expect(shouldSkipAdvisoryForMechanicalCloseout({
      findings: [
        {
          id: 'gap-deploy-docs',
          category: 'missing_deployment_docs',
          severity: 'medium',
          message: 'Missing deployment docs',
          why_it_matters: '',
          suggested_fix: '',
          related_files: ['README.md'],
        },
        {
          id: 'gap-ops-docs',
          category: 'missing_operational_docs',
          severity: 'medium',
          message: 'Missing operations docs',
          why_it_matters: '',
          suggested_fix: '',
          related_files: ['docs/operations.md'],
        },
      ],
      product_maturity: {
        domain: 'agent_social_deduction_theater',
        target_market: 'mature agent-facing werewolf simulation and observer product',
        score: 95,
        level: 'market_parity_candidate',
        summary: 'deployment docs remain',
        capabilities: [],
        missing_capabilities: ['Deployable runtime with CI hooks', 'Operations documentation'],
        references: [],
      },
    })).toBe(true);

    expect(shouldSkipAdvisoryForMechanicalCloseout({
      findings: [{
        id: 'gap-market',
        category: 'below_market_research_parity',
        severity: 'medium',
        message: 'Market parity missing',
        why_it_matters: '',
        suggested_fix: '',
        related_files: ['docs/market-research-roadmap.md'],
      }],
      product_maturity: undefined,
    })).toBe(false);
  });

  it('runs controlled market research before model-backed advisory planning when requested', async () => {
    await fs.mkdir(path.join(demo, 'src'), { recursive: true });
    await fs.writeFile(path.join(demo, 'package.json'), JSON.stringify({
      name: 'demo',
      scripts: { dev: 'vite' },
      dependencies: { vue: '^3.5.0', vite: '^5.0.0' },
    }, null, 2));
    await fs.writeFile(path.join(demo, 'src', 'App.vue'), '<template><main>Hello</main></template>\n');

    const queries: string[] = [];
    const searchProvider: SearchProvider = {
      name: 'fake-search',
      async search(query) {
        queries.push(query);
        return [
          {
            title: 'Production UI accessibility guide',
            url: 'https://example.com/accessibility-responsive-keyboard-touch',
            snippet: 'responsive accessibility keyboard touch aria onboarding error state support',
          },
          {
            title: 'Mature product onboarding patterns',
            url: 'https://example.com/onboarding-loading-error-state',
            snippet: 'onboarding loading empty state error state retry support',
          },
        ];
      },
    };

    let capturedResearch: MarketResearchReport | null | undefined;
    const advisoryProvider = new MockAdvisoryProvider({
      raw_summary: 'capture market research',
      onRequest: (request) => {
        capturedResearch = request.marketResearch;
      },
    });

    const summaries = await new SupervisorAgent().iterate({
      projectPath: demo,
      goal: 'project-ready with current competitor context',
      provider: new MockAgentProvider('happy'),
      maxIterations: 1,
      advisory: {
        provider: advisoryProvider,
        roles: ['market_comparator'],
        allowNetwork: true,
        autoResearch: true,
        searchProvider,
      },
    });

    const report = await loadMarketResearchReport(demo);
    expect(queries[0]).toContain('production web UI');
    expect(report?.domain).toBe('web_ui_app');
    expect(report?.sources.length).toBe(2);
    expect(capturedResearch?.capabilities.map((cap) => cap.id)).toContain('responsive_accessible_ui');
    expect(summaries[0]!.gap_report.product_maturity?.domain).toBe('web_ui_app');
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

  it('does not stop on production-ready score while gap findings remain', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-sup-score-gap-'));
    await fs.mkdir(path.join(dir, 'bin'), { recursive: true });
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      name: 'score-gap-cli',
      type: 'module',
      bin: { 'score-gap-cli': './bin/cli.js' },
      scripts: { build: 'node --check bin/cli.js' },
    }, null, 2));
    await fs.writeFile(path.join(dir, 'bin', 'cli.js'), '#!/usr/bin/env node\nif (process.argv.includes("--help")) console.log("Usage: score-gap-cli");\n');

    const summaries = await new SupervisorAgent().iterate({
      projectPath: dir,
      goal: 'reach production ready only when no gaps remain',
      provider: new RuleBasedExecutor(),
      maxIterations: 6,
    });

    expect(summaries.length).toBeGreaterThan(2);
    expect(await fs.stat(path.join(dir, '.github', 'workflows', 'ci.yml'))).toBeTruthy();
    const after = await new AnalyzerAgent().fullAnalyzeWithEvidence(dir, { runCommands: true });
    expect(after.gap.findings.some((finding) => finding.category === 'no_ci')).toBe(false);
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
