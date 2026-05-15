import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { MiniMaxProvider } from '../src/agents/providers/MiniMaxProvider.js';
import type { AgentTask, IterationEvent } from '../src/core/types.js';

async function tmp() {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-minimax-'));
  await fs.writeFile(path.join(dir, 'package.json'), '{}');
  return dir;
}

const task: AgentTask = {
  id: 't_minimax',
  iteration_id: 'i_minimax',
  assigned_to: 'executor',
  title: 'Author or extend README.md',
  description: 'add a README scaffold',
  acceptance_criteria: ['README exists', 'README has Install + Usage'],
  expected_changed_files: ['README.md'],
  verification_commands: ['test -s README.md'],
  priority: 'medium',
  status: 'pending',
};

describe('MiniMaxProvider', () => {
  it('defaults to MiniMax-M2.7-highspeed and applies returned file edits before verification', async () => {
    const dir = await tmp();
    let observedUrl = '';
    let observedInit: RequestInit | undefined;
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      observedUrl = String(url);
      observedInit = init;
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: `<think>Preparing a small README edit.</think>\n\n${JSON.stringify({
              summary: 'Added README scaffold',
              changed_files: ['README.md'],
              edits: [{
                path: 'README.md',
                content: '# Provtest\n\n## Install\n\n```bash\nnpm install\n```\n\n## Usage\n',
              }],
              risks: [],
              next_steps: [],
            })}`,
          },
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const provider = new MiniMaxProvider({ enabled: true, apiKey: 'test-key', fetchImpl });
    const result = await provider.runTask(task, {
      project_path: dir,
      iteration_id: 'i_minimax',
      recent_events: [],
    });

    expect(result.status).toBe('completed');
    expect(result.changed_files).toEqual(['README.md']);
    expect(result.verification_evidence[0]?.passed).toBe(true);
    expect(await fs.readFile(path.join(dir, 'README.md'), 'utf8')).toContain('## Usage');
    expect(observedUrl).toBe('https://api.minimaxi.com/v1/chat/completions');
    expect((observedInit?.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
    const body = JSON.parse(String(observedInit?.body));
    expect(body.model).toBe('MiniMax-M2.7-highspeed');
    expect(body.messages.some((m: { content?: string }) => m.content?.includes('Expected changed files: README.md'))).toBe(true);
  });

  it('fails closed when enabled without an API key', async () => {
    const dir = await tmp();
    const provider = new MiniMaxProvider({ enabled: true, apiKey: '' });
    const result = await provider.runTask(task, {
      project_path: dir,
      iteration_id: 'i_minimax',
      recent_events: [],
    });

    expect(result.status).toBe('failed');
    expect(result.unable_to_verify_reason).toBe('missing_minimax_api_key');
    expect(result.changed_files).toEqual([]);
  });

  it('routes mechanical Dockerfile recommended-file tasks through deterministic deployment scaffolding', async () => {
    const dir = await tmp();
    await fs.writeFile(path.join(dir, 'app.py'), 'from flask import Flask\napp = Flask(__name__)\n@app.route("/healthz")\ndef healthz():\n    return "ok"\n');
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask>=3.0.0,<4.0.0\npytest>=8.0.0,<9.0.0\n');
    await fs.writeFile(path.join(dir, 'constraints.txt'), 'flask>=3.0.0,<4.0.0\npytest>=8.0.0,<9.0.0\n');
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response('{}', { status: 500 });
    }) as typeof fetch;
    const provider = new MiniMaxProvider({ enabled: true, apiKey: 'test-key', fetchImpl });

    const result = await provider.runTask(
      {
        id: 't_docker_recommended',
        iteration_id: 'i_minimax',
        assigned_to: 'executor',
        title: 'Address gap: missing_recommended_file (Dockerfile)',
        description: 'Missing recommended file/dir: Dockerfile',
        acceptance_criteria: ['Dockerfile exists'],
        expected_changed_files: ['Dockerfile'],
        verification_commands: [
          'python3 -c "from pathlib import Path; t=Path(\'Dockerfile\').read_text().lower(); assert \'gunicorn\' in t and \'wsgi:app\' in t"',
        ],
        priority: 'medium',
        status: 'pending',
      },
      { project_path: dir, iteration_id: 'i_minimax', recent_events: [] },
    );

    expect(calls).toBe(0);
    expect(result.status).toBe('completed');
    expect(result.changed_files).toContain('Dockerfile');
    expect(result.changed_files).toContain('wsgi.py');
    expect(result.risks).toContain('deterministic_first_mechanical_deployment_scaffold');
    expect(await fs.readFile(path.join(dir, 'Dockerfile'), 'utf8')).toContain('-c constraints.txt');
  });

  it('includes recent verification failures and referenced files in the prompt', async () => {
    const dir = await tmp();
    await fs.writeFile(path.join(dir, 'prompts.py'), 'PROMPTS_SENTINEL = True\n');
    let userPrompt = '';
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      userPrompt = body.messages.find((m: { role: string }) => m.role === 'user')?.content ?? '';
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              summary: 'Added README scaffold',
              changed_files: ['README.md'],
              edits: [{ path: 'README.md', content: '# Provtest\n' }],
              risks: [],
              next_steps: [],
            }),
          },
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    const recent: IterationEvent[] = [{
      id: 'evt_recent',
      iteration_id: 'i_minimax',
      timestamp: '2026-05-13T00:00:00.000Z',
      agent: 'verifier',
      event_type: 'verification_failed',
      severity: 'high',
      message: 'failed: python3 -m pytest -q',
      raw_output: 'prompts.py:83: TypeError: unsupported operand type(s) for |',
    }];

    const provider = new MiniMaxProvider({ enabled: true, apiKey: 'test-key', fetchImpl });
    await provider.runTask(task, {
      project_path: dir,
      iteration_id: 'i_minimax',
      recent_events: recent,
    });

    expect(userPrompt).toContain('Recent iteration evidence');
    expect(userPrompt).toContain('prompts.py:83');
    expect(userPrompt).toContain('PROMPTS_SENTINEL');
  });

  it('broadens Python repair context for project-wide compatibility failures', async () => {
    const dir = await tmp();
    await fs.writeFile(path.join(dir, 'game.py'), 'GAME_SENTINEL: int | None = None\n');
    await fs.writeFile(path.join(dir, 'player.py'), 'PLAYER_SENTINEL: dict | None = None\n');
    await fs.writeFile(path.join(dir, 'prompts.py'), 'PROMPTS_SENTINEL: list | None = None\n');
    let userPrompt = '';
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      userPrompt = body.messages.find((m: { role: string }) => m.role === 'user')?.content ?? '';
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              summary: 'No safe edit',
              changed_files: [],
              edits: [],
              risks: ['needs compatibility scan'],
              next_steps: [],
            }),
          },
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    const recent: IterationEvent[] = [{
      id: 'evt_py39',
      iteration_id: 'i_minimax',
      timestamp: '2026-05-13T00:00:00.000Z',
      agent: 'verifier',
      event_type: 'verification_failed',
      severity: 'high',
      message: 'failed: python3 -m pytest -q',
      raw_output: 'prompts.py:83: TypeError: unsupported operand type(s) for |: "type" and "NoneType"',
    }];

    const provider = new MiniMaxProvider({ enabled: true, apiKey: 'test-key', fetchImpl });
    await provider.runTask(task, {
      project_path: dir,
      iteration_id: 'i_minimax',
      recent_events: recent,
    });

    expect(userPrompt).toContain('project-wide Python compatibility pattern');
    expect(userPrompt).toContain('--- game.py ---');
    expect(userPrompt).toContain('GAME_SENTINEL');
    expect(userPrompt).toContain('--- player.py ---');
    expect(userPrompt).toContain('PLAYER_SENTINEL');
    expect(userPrompt).toContain('--- prompts.py ---');
    expect(userPrompt).toContain('PROMPTS_SENTINEL');
  });

  it('completes incomplete project-wide Python annotation compatibility repairs deterministically', async () => {
    const dir = await tmp();
    await fs.writeFile(path.join(dir, 'game.py'), 'def game(value: int | None = None):\n    return value\n');
    await fs.writeFile(path.join(dir, 'player.py'), 'def player(value: dict | None = None):\n    return value\n');
    await fs.writeFile(path.join(dir, 'prompts.py'), 'def prompt(value: list | None = None):\n    return value\n');
    const repairTask: AgentTask = {
      id: 't_py_compat_repair',
      iteration_id: 'i_minimax',
      assigned_to: 'executor',
      title: 'Repair failed verification: python3 -m pytest -q',
      description: 'pytest failed with unsupported operand type(s) for | while importing Python modules.',
      acceptance_criteria: ['all Python modules import on Python 3.9 compatible runtimes'],
      expected_changed_files: ['game.py', 'player.py', 'prompts.py'],
      verification_commands: ['python3 -c "import game, player, prompts"'],
      priority: 'blocker',
      status: 'pending',
    };
    const recent: IterationEvent[] = [{
      id: 'evt_py39',
      iteration_id: 'i_minimax',
      timestamp: '2026-05-13T00:00:00.000Z',
      agent: 'verifier',
      event_type: 'verification_failed',
      severity: 'high',
      message: 'failed: python3 -m pytest -q',
      raw_output: 'prompts.py:83: TypeError: unsupported operand type(s) for |: "type" and "NoneType"',
    }];
    let calls = 0;
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      calls++;
      JSON.parse(String(init?.body));
      const edits = [
        { path: 'game.py', content: 'from __future__ import annotations\n\ndef game(value: int | None = None):\n    return value\n' },
        { path: 'prompts.py', content: 'from __future__ import annotations\n\ndef prompt(value: list | None = None):\n    return value\n' },
      ];
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              summary: 'Fixed two files',
              changed_files: edits.map((edit) => edit.path),
              edits,
              risks: [],
              next_steps: [],
            }),
          },
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const provider = new MiniMaxProvider({ enabled: true, apiKey: 'test-key', fetchImpl });
    const result = await provider.runTask(repairTask, {
      project_path: dir,
      iteration_id: 'i_minimax',
      recent_events: recent,
    });

    expect(calls).toBe(1);
    expect(result.status).toBe('completed');
    expect(result.changed_files).toEqual(['game.py', 'player.py', 'prompts.py']);
    expect(result.risks).toContain('provider_completed_python_compatibility_repair');
    expect(await fs.readFile(path.join(dir, 'player.py'), 'utf8')).toContain('from __future__ import annotations');
  });

  it('repairs unparseable unsafe-edit repair responses before giving up', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-minimax-api-repair-json-'));
    await fs.writeFile(path.join(dir, 'app.py'), 'from flask import Flask\napp = Flask(__name__)\n@app.route("/healthz")\ndef healthz(): return "ok"\n');
    const apiTask: AgentTask = {
      id: 't_api_contract_json_repair',
      iteration_id: 'i_minimax',
      assigned_to: 'executor',
      title: 'Add API contract harness with unsafe-edit JSON repair',
      description: 'Add docs/api-contract.md and scripts/api-contract-check.mjs for the detected Flask API surface.',
      acceptance_criteria: [
        'docs/api-contract.md documents the detected API surface',
        'scripts/api-contract-check.mjs fails when no API surface evidence exists',
      ],
      expected_changed_files: ['docs/api-contract.md', 'scripts/api-contract-check.mjs', 'package.json'],
      verification_commands: ['node scripts/api-contract-check.mjs'],
      priority: 'high',
      status: 'pending',
    };
    let calls = 0;
    let thirdPrompt = '';
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      if (calls === 3) thirdPrompt = body.messages.find((m: { role: string }) => m.role === 'user')?.content ?? '';
      const content = calls === 1
        ? JSON.stringify({
          summary: 'Added package script only',
          changed_files: ['package.json'],
          edits: [{ path: 'package.json', content: JSON.stringify({ scripts: { 'api:contract-check': 'node scripts/api-contract-check.mjs' } }, null, 2) }],
          risks: [],
          next_steps: [],
        })
        : calls === 2
          ? 'I added the missing contract doc and script but forgot the JSON wrapper.'
          : JSON.stringify({
            summary: 'Added complete API contract harness after JSON repair',
            changed_files: ['docs/api-contract.md', 'scripts/api-contract-check.mjs', 'package.json'],
            edits: [
              { path: 'docs/api-contract.md', content: '# API Contract\n\nDocuments /healthz.\n' },
              { path: 'scripts/api-contract-check.mjs', content: 'import { readFileSync } from "node:fs";\nconst app = readFileSync("app.py", "utf8");\nif (!/@app\\.route\\(.*healthz/s.test(app)) process.exit(1);\n' },
              { path: 'package.json', content: JSON.stringify({ scripts: { 'api:contract-check': 'node scripts/api-contract-check.mjs' } }, null, 2) },
            ],
            risks: [],
            next_steps: [],
          });
      return new Response(JSON.stringify({
        choices: [{ message: { content } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const provider = new MiniMaxProvider({ enabled: true, apiKey: 'test-key', fetchImpl });
    const result = await provider.runTask(apiTask, {
      project_path: dir,
      iteration_id: 'i_minimax',
      recent_events: [],
    });

    expect(calls).toBe(3);
    expect(thirdPrompt).toContain('Previous MiniMax response could not be parsed');
    expect(thirdPrompt).toContain('forgot the JSON wrapper');
    expect(result.status).toBe('completed');
    expect(result.risks).toEqual(expect.arrayContaining([
      'provider_unsafe_edit_repair_retry_used',
      'provider_unsafe_edit_output_repair_retry_used',
    ]));
  });

  it('retries Python smoke tests that import side-effectful top-level scripts', async () => {
    const dir = await tmp();
    await fs.writeFile(path.join(dir, 'app.py'), 'VALUE = 1\n');
    await fs.writeFile(path.join(dir, 'diag.py'), 'from openai import OpenAI\nclient = OpenAI(api_key=None)\n');
    const smokeTask: AgentTask = {
      id: 't_python_smoke_side_effects',
      iteration_id: 'i_minimax',
      assigned_to: 'executor',
      title: 'Add Python smoke tests',
      description: 'Add pytest smoke tests for Python files without requiring live credentials.',
      acceptance_criteria: ['smoke tests do not require real network credentials', 'pytest passes'],
      expected_changed_files: ['requirements.txt', 'tests/test_smoke.py'],
      verification_commands: ['python3 -m pytest -q'],
      priority: 'high',
      status: 'pending',
    };
    let calls = 0;
    let secondPrompt = '';
    const unsafeSmoke = [
      'import importlib',
      'import pytest',
      'PYTHON_MODULES = ["app", "diag"]',
      '@pytest.mark.parametrize("module_name", PYTHON_MODULES)',
      'def test_module_imports(module_name):',
      '    importlib.import_module(module_name)',
      '',
    ].join('\n');
    const safeSmoke = [
      'import py_compile',
      'from pathlib import Path',
      '',
      'def test_python_files_compile():',
      '    for path in Path(".").glob("*.py"):',
      '        py_compile.compile(str(path), doraise=True)',
      '',
      'def test_app_importable():',
      '    import app',
      '    assert app.VALUE == 1',
      '',
    ].join('\n');
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      if (calls === 2) secondPrompt = body.messages.find((m: { role: string }) => m.role === 'user')?.content ?? '';
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              summary: calls === 1 ? 'Added broad imports' : 'Added isolated smoke tests',
              changed_files: ['requirements.txt', 'tests/test_smoke.py'],
              edits: [
                { path: 'requirements.txt', content: 'pytest>=8\n' },
                { path: 'tests/test_smoke.py', content: calls === 1 ? unsafeSmoke : safeSmoke },
              ],
              risks: [],
              next_steps: [],
            }),
          },
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const provider = new MiniMaxProvider({ enabled: true, apiKey: 'test-key', fetchImpl });
    const result = await provider.runTask(smokeTask, {
      project_path: dir,
      iteration_id: 'i_minimax',
      recent_events: [],
    });

    expect(calls).toBe(2);
    expect(secondPrompt).toContain('side-effectful top-level scripts');
    expect(result.status).toBe('completed');
    expect(await fs.readFile(path.join(dir, 'tests', 'test_smoke.py'), 'utf8')).toBe(safeSmoke);
  });

  it('retries Python smoke tests that directly import side-effectful scripts', async () => {
    const dir = await tmp();
    await fs.writeFile(path.join(dir, 'app.py'), 'VALUE = 1\n');
    await fs.writeFile(path.join(dir, 'diag.py'), 'from openai import OpenAI\nclient = OpenAI(api_key=None)\n');
    const smokeTask: AgentTask = {
      id: 't_python_smoke_direct_side_effects',
      iteration_id: 'i_minimax',
      assigned_to: 'executor',
      title: 'Add Python smoke tests',
      description: 'Add pytest smoke tests for Python files without importing credentialed diagnostics.',
      acceptance_criteria: ['smoke tests do not import credentialed diagnostics'],
      expected_changed_files: ['requirements.txt', 'tests/test_smoke.py'],
      verification_commands: ['python3 -m pytest -q'],
      priority: 'high',
      status: 'pending',
    };
    let calls = 0;
    let secondPrompt = '';
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      if (calls === 2) secondPrompt = body.messages.find((m: { role: string }) => m.role === 'user')?.content ?? '';
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              summary: calls === 1 ? 'Imported diag directly' : 'Avoided diagnostic import',
              changed_files: ['requirements.txt', 'tests/test_smoke.py'],
              edits: [
                { path: 'requirements.txt', content: 'pytest>=8\n' },
                {
                  path: 'tests/test_smoke.py',
                  content: calls === 1
                    ? 'import diag\n\ndef test_diag_imports():\n    assert diag\n'
                    : 'import py_compile\n\ndef test_diag_compiles():\n    py_compile.compile("diag.py", doraise=True)\n',
                },
              ],
              risks: [],
              next_steps: [],
            }),
          },
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const provider = new MiniMaxProvider({ enabled: true, apiKey: 'test-key', fetchImpl });
    const result = await provider.runTask(smokeTask, {
      project_path: dir,
      iteration_id: 'i_minimax',
      recent_events: [],
    });

    expect(calls).toBe(2);
    expect(secondPrompt).toContain('side-effectful top-level scripts');
    expect(result.status).toBe('completed');
  });

  it('retries Python smoke tests that assert nonexistent source exports', async () => {
    const dir = await tmp();
    await fs.writeFile(path.join(dir, 'prompts.py'), 'ROLE_DESC = {"wolf": "Werewolf"}\nPERSONALITY_PRESETS = {}\n');
    const smokeTask: AgentTask = {
      id: 't_python_smoke_exports',
      iteration_id: 'i_minimax',
      assigned_to: 'executor',
      title: 'Add Python smoke tests',
      description: 'Add pytest smoke tests based on actual source exports.',
      acceptance_criteria: ['tests inspect actual exported names instead of hallucinated names'],
      expected_changed_files: ['requirements.txt', 'tests/test_smoke.py'],
      verification_commands: ['python3 -m pytest -q'],
      priority: 'high',
      status: 'pending',
    };
    let calls = 0;
    let secondPrompt = '';
    const badSmoke = 'from prompts import ROLES, PERSONALITIES\n\ndef test_prompts_exports():\n    assert ROLES\n    assert PERSONALITIES is not None\n';
    const goodSmoke = 'import prompts\n\ndef test_prompts_exports():\n    assert isinstance(prompts.ROLE_DESC, dict)\n    assert isinstance(prompts.PERSONALITY_PRESETS, dict)\n';
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      if (calls === 2) secondPrompt = body.messages.find((m: { role: string }) => m.role === 'user')?.content ?? '';
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              summary: calls === 1 ? 'Added hallucinated export tests' : 'Added source-backed export tests',
              changed_files: ['requirements.txt', 'tests/test_smoke.py'],
              edits: [
                { path: 'requirements.txt', content: 'pytest>=8\n' },
                { path: 'tests/test_smoke.py', content: calls === 1 ? badSmoke : goodSmoke },
              ],
              risks: [],
              next_steps: [],
            }),
          },
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const provider = new MiniMaxProvider({ enabled: true, apiKey: 'test-key', fetchImpl });
    const result = await provider.runTask(smokeTask, {
      project_path: dir,
      iteration_id: 'i_minimax',
      recent_events: [],
    });

    expect(calls).toBe(2);
    expect(secondPrompt).toContain('non-existent project symbols');
    expect(result.status).toBe('completed');
    expect(await fs.readFile(path.join(dir, 'tests', 'test_smoke.py'), 'utf8')).toBe(goodSmoke);
  });

  it('retries Python smoke tests that directly import modules with unresolved annotation compatibility risk', async () => {
    const dir = await tmp();
    await fs.writeFile(path.join(dir, 'prompts.py'), 'def build_system_prompt(personality: dict | None = None):\n    return "prompt"\n');
    const smokeTask: AgentTask = {
      id: 't_python_smoke_risky_direct_import',
      iteration_id: 'i_minimax',
      assigned_to: 'executor',
      title: 'Add Python smoke tests',
      description: 'Add safe smoke tests that do not trip runtime annotation evaluation.',
      acceptance_criteria: ['smoke tests use compile/ast checks for risky modules'],
      expected_changed_files: ['requirements.txt', 'tests/test_smoke.py'],
      verification_commands: ['python3 -m pytest -q'],
      priority: 'high',
      status: 'pending',
    };
    let calls = 0;
    let secondPrompt = '';
    const unsafeSmoke = 'import prompts\n\ndef test_prompts_imports():\n    assert prompts.build_system_prompt()\n';
    const safeSmoke = 'import ast\nfrom pathlib import Path\n\ndef test_python_sources_parse():\n    for path in Path(".").glob("*.py"):\n        ast.parse(path.read_text(encoding="utf-8"))\n';
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      if (calls === 2) secondPrompt = body.messages.find((m: { role: string }) => m.role === 'user')?.content ?? '';
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              summary: calls === 1 ? 'Imported prompts directly' : 'Switched to AST parse smoke',
              changed_files: ['requirements.txt', 'tests/test_smoke.py'],
              edits: [
                { path: 'requirements.txt', content: 'pytest>=8\n' },
                { path: 'tests/test_smoke.py', content: calls === 1 ? unsafeSmoke : safeSmoke },
              ],
              risks: [],
              next_steps: [],
            }),
          },
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const provider = new MiniMaxProvider({ enabled: true, apiKey: 'test-key', fetchImpl });
    const result = await provider.runTask(smokeTask, {
      project_path: dir,
      iteration_id: 'i_minimax',
      recent_events: [],
    });

    expect(calls).toBe(2);
    expect(secondPrompt).toContain('runtime-evaluated modern annotations');
    expect(result.status).toBe('completed');
    expect(await fs.readFile(path.join(dir, 'tests', 'test_smoke.py'), 'utf8')).toBe(safeSmoke);
  });

  it('retries Python smoke tests whose secret scan matches its own regex literals', async () => {
    const dir = await tmp();
    await fs.writeFile(path.join(dir, 'app.py'), 'VALUE = 1\n');
    const smokeTask: AgentTask = {
      id: 't_python_smoke_secret_self_scan',
      iteration_id: 'i_minimax',
      assigned_to: 'executor',
      title: 'Add Python smoke tests',
      description: 'Add source secret checks without false positives from test literals.',
      acceptance_criteria: ['secret scan excludes generated tests'],
      expected_changed_files: ['requirements.txt', 'tests/test_smoke.py'],
      verification_commands: ['python3 -m pytest -q'],
      priority: 'high',
      status: 'pending',
    };
    let calls = 0;
    const unsafeSmoke = [
      'import pathlib, re',
      '_PY_FILES = list(pathlib.Path(".").glob("*.py")) + list(pathlib.Path("tests").glob("*.py"))',
      'def test_no_private_keys():',
      '    for py_file in _PY_FILES:',
      '        assert not re.findall(r"-----BEGIN PRIVATE KEY-----", py_file.read_text())',
      '',
    ].join('\n');
    const safeSmoke = [
      'import pathlib, re',
      '_PY_FILES = list(pathlib.Path(".").glob("*.py"))',
      'def test_no_private_keys():',
      '    pattern = "PRIVATE" + " KEY"',
      '    for py_file in _PY_FILES:',
      '        assert not re.findall(pattern, py_file.read_text())',
      '',
    ].join('\n');
    const fetchImpl = (async () => {
      calls++;
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              summary: calls === 1 ? 'Added broad secret scan' : 'Restricted secret scan',
              changed_files: ['requirements.txt', 'tests/test_smoke.py'],
              edits: [
                { path: 'requirements.txt', content: 'pytest>=8\n' },
                { path: 'tests/test_smoke.py', content: calls === 1 ? unsafeSmoke : safeSmoke },
              ],
              risks: [],
              next_steps: [],
            }),
          },
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const provider = new MiniMaxProvider({ enabled: true, apiKey: 'test-key', fetchImpl });
    const result = await provider.runTask(smokeTask, {
      project_path: dir,
      iteration_id: 'i_minimax',
      recent_events: [],
    });

    expect(calls).toBe(2);
    expect(result.status).toBe('completed');
    expect(await fs.readFile(path.join(dir, 'tests', 'test_smoke.py'), 'utf8')).toBe(safeSmoke);
  });

  it('retries Python smoke tests that invent hard-coded modes or brittle route literals', async () => {
    const dir = await tmp();
    await fs.writeFile(path.join(dir, 'game.py'), 'GAME_MODES = {"m6": {}, "m8": {}, "m9": {}, "m10": {}, "m11": {}}\n');
    await fs.writeFile(path.join(dir, 'app.py'), 'from flask import Flask\napp = Flask(__name__)\n@app.route("/stream/<game_id>")\ndef stream(game_id): return "ok"\n');
    const smokeTask: AgentTask = {
      id: 't_python_smoke_overspecified',
      iteration_id: 'i_minimax',
      assigned_to: 'executor',
      title: 'Add Python smoke tests',
      description: 'Add source-safe smoke tests without inventing product-specific constants.',
      acceptance_criteria: ['smoke tests reflect actual source'],
      expected_changed_files: ['requirements.txt', 'tests/test_smoke.py'],
      verification_commands: ['python3 -m pytest -q'],
      priority: 'high',
      status: 'pending',
    };
    let calls = 0;
    let secondPrompt = '';
    const badSmoke = [
      'from pathlib import Path',
      '',
      'def test_five_modes_in_source():',
      '    content = Path("game.py").read_text(encoding="utf-8")',
      '    for mode in ["m6", "m7", "m8", "m9", "m10", "m11"]:',
      '        assert mode in content, f"Mode {mode} not found in game.py"',
      '',
      'def test_required_routes_defined():',
      '    content = Path("app.py").read_text(encoding="utf-8")',
      '    required_routes = ["/", "/modes", "/start", "/stream"]',
      '    for route in required_routes:',
      '        assert f\'"{route}"\' in content or f"\'{route}\'" in content, f"Route {route} not found"',
      '',
    ].join('\n');
    const safeSmoke = 'import ast\nfrom pathlib import Path\n\ndef test_python_sources_parse():\n    ast.parse(Path("game.py").read_text(encoding="utf-8"))\n    ast.parse(Path("app.py").read_text(encoding="utf-8"))\n';
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      if (calls === 2) secondPrompt = body.messages.find((m: { role: string }) => m.role === 'user')?.content ?? '';
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              summary: calls === 1 ? 'Added over-specific source checks' : 'Added source-safe AST smoke',
              changed_files: ['requirements.txt', 'tests/test_smoke.py'],
              edits: [
                { path: 'requirements.txt', content: 'pytest>=8\n' },
                { path: 'tests/test_smoke.py', content: calls === 1 ? badSmoke : safeSmoke },
              ],
              risks: [],
              next_steps: [],
            }),
          },
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const provider = new MiniMaxProvider({ enabled: true, apiKey: 'test-key', fetchImpl });
    const result = await provider.runTask(smokeTask, {
      project_path: dir,
      iteration_id: 'i_minimax',
      recent_events: [],
    });

    expect(calls).toBe(2);
    expect(secondPrompt).toContain('hard-coded game modes');
    expect(result.status).toBe('completed');
    expect(await fs.readFile(path.join(dir, 'tests', 'test_smoke.py'), 'utf8')).toBe(safeSmoke);
  });

  it('retries Python edits that remove exports still imported by other source files', async () => {
    const dir = await tmp();
    await fs.writeFile(path.join(dir, 'prompts.py'), 'def build_system_prompt():\n    return "werewolf prompt"\n\nROLE_DESC = {}\n');
    await fs.writeFile(path.join(dir, 'player.py'), 'from prompts import build_system_prompt\n\nPERSONALITIES = []\n\ndef make_prompt():\n    return build_system_prompt()\n');
    const repairTask: AgentTask = {
      id: 't_python_export_contract',
      iteration_id: 'i_minimax',
      assigned_to: 'executor',
      title: 'Repair failed verification: python3 -m pytest -q',
      description: 'pytest failed in prompts smoke tests; preserve real source imports.',
      acceptance_criteria: ['existing cross-file imports remain valid'],
      expected_changed_files: ['prompts.py'],
      verification_commands: ['python3 -c "import player; assert player.make_prompt()"'],
      priority: 'blocker',
      status: 'pending',
    };
    let calls = 0;
    let secondPrompt = '';
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      if (calls === 2) secondPrompt = body.messages.find((m: { role: string }) => m.role === 'user')?.content ?? '';
      const content = calls === 1
        ? 'ROLES = {}\nPERSONALITIES = {}\n'
        : 'def build_system_prompt():\n    return "werewolf prompt"\n\nROLE_DESC = {}\nROLES = ROLE_DESC\nPERSONALITIES = {}\n';
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              summary: calls === 1 ? 'Added smoke-test exports' : 'Preserved source import contract',
              changed_files: ['prompts.py'],
              edits: [{ path: 'prompts.py', content }],
              risks: [],
              next_steps: [],
            }),
          },
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const provider = new MiniMaxProvider({ enabled: true, apiKey: 'test-key', fetchImpl });
    const result = await provider.runTask(repairTask, {
      project_path: dir,
      iteration_id: 'i_minimax',
      recent_events: [],
    });

    expect(calls).toBe(2);
    expect(secondPrompt).toContain('removed Python exports still imported');
    expect(result.status).toBe('completed');
    expect(await fs.readFile(path.join(dir, 'prompts.py'), 'utf8')).toContain('def build_system_prompt');
  });

  it('retries Python edits that introduce missing local imports or import cycles', async () => {
    const dir = await tmp();
    const originalPrompts = 'def build_system_prompt():\n    return "prompt"\n\nPERSONALITIES = []\n';
    await fs.writeFile(path.join(dir, 'prompts.py'), originalPrompts);
    await fs.writeFile(path.join(dir, 'player.py'), 'from prompts import build_system_prompt\n\nPERSONALITIES = []\n\ndef make_prompt():\n    return build_system_prompt()\n');
    const repairTask: AgentTask = {
      id: 't_python_import_cycle',
      iteration_id: 'i_minimax',
      assigned_to: 'executor',
      title: 'Repair failed verification: python3 -m pytest -q',
      description: 'pytest failed while importing prompts/player; preserve local import contracts.',
      acceptance_criteria: ['local imports remain acyclic and valid'],
      expected_changed_files: ['prompts.py'],
      verification_commands: ['python3 -c "import player; print(player.make_prompt())"'],
      priority: 'blocker',
      status: 'pending',
    };
    let calls = 0;
    let secondPrompt = '';
    const badPrompts = 'from player import PERSONALITIES\n\ndef build_system_prompt():\n    return "prompt"\n';
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      if (calls === 2) secondPrompt = body.messages.find((m: { role: string }) => m.role === 'user')?.content ?? '';
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              summary: calls === 1 ? 'Moved personalities import' : 'Preserved prompt exports',
              changed_files: ['prompts.py'],
              edits: [{ path: 'prompts.py', content: calls === 1 ? badPrompts : originalPrompts }],
              risks: [],
              next_steps: [],
            }),
          },
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const provider = new MiniMaxProvider({ enabled: true, apiKey: 'test-key', fetchImpl });
    const result = await provider.runTask(repairTask, {
      project_path: dir,
      iteration_id: 'i_minimax',
      recent_events: [],
    });

    expect(calls).toBe(2);
    expect(secondPrompt).toContain('introduces local Python import cycle');
    expect(result.status).toBe('completed');
    expect(await fs.readFile(path.join(dir, 'prompts.py'), 'utf8')).toBe(originalPrompts);
  });

  it('repairs common unquoted-key JSON drift in multi-file edit payloads', async () => {
    const dir = await tmp();
    const fetchImpl = (async () => {
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: '{"summary":"Added files","changed_files":["README.md",".dockerignore"],"edits":[{"path":"README.md","content":"# Provtest\\n"},{path":".dockerignore","content":"__pycache__/\\n"}],"risks":[],"next_steps":[]}',
          },
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const provider = new MiniMaxProvider({ enabled: true, apiKey: 'test-key', fetchImpl });
    const result = await provider.runTask(task, {
      project_path: dir,
      iteration_id: 'i_minimax',
      recent_events: [],
    });

    expect(result.status).toBe('completed');
    expect(await fs.readFile(path.join(dir, '.dockerignore'), 'utf8')).toContain('__pycache__');
  });

  it('retries once with a JSON repair prompt when the first model response is unparseable', async () => {
    const dir = await tmp();
    const userPrompts: string[] = [];
    let calls = 0;
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      userPrompts.push(body.messages.find((m: { role: string }) => m.role === 'user')?.content ?? '');
      const content = calls === 1
        ? 'I updated the README, but here is not JSON.'
        : JSON.stringify({
          summary: 'Added README after repair retry',
          changed_files: ['README.md'],
          edits: [{
            path: 'README.md',
            content: '# Provtest\n\n## Install\n\nnpm install\n\n## Usage\n\nnpm start\n',
          }],
          risks: [],
          next_steps: [],
        });
      return new Response(JSON.stringify({
        choices: [{ message: { content } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const provider = new MiniMaxProvider({ enabled: true, apiKey: 'test-key', fetchImpl });
    const result = await provider.runTask(task, {
      project_path: dir,
      iteration_id: 'i_minimax',
      recent_events: [],
    });

    expect(calls).toBe(2);
    expect(userPrompts[1]).toContain('Previous MiniMax response could not be parsed');
    expect(userPrompts[1]).toContain('I updated the README');
    expect(result.status).toBe('completed');
    expect(result.risks).toContain('provider_output_repair_retry_used');
  });

  it('falls back to deterministic handlers when MiniMax edit JSON remains unparseable', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-minimax-deterministic-fallback-'));
    await fs.writeFile(path.join(dir, 'app.py'), 'from flask import Flask\napp = Flask(__name__)\n@app.route("/healthz")\ndef healthz(): return "ok"\n');
    const apiTask: AgentTask = {
      id: 't_api_contract_fallback',
      iteration_id: 'i_minimax',
      assigned_to: 'executor',
      title: 'Add API contract harness after unparseable MiniMax output',
      description: 'Add source-backed API contract docs and check script.',
      acceptance_criteria: ['contract docs and executable check script exist'],
      expected_changed_files: ['docs/api-contract.md', 'scripts/api-contract-check.mjs', 'package.json'],
      verification_commands: ['node scripts/api-contract-check.mjs'],
      priority: 'high',
      status: 'pending',
    };
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response(JSON.stringify({
        choices: [{ message: { content: calls === 1 ? 'I made the files but not JSON.' : 'Still not JSON.' } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const provider = new MiniMaxProvider({ enabled: true, apiKey: 'test-key', fetchImpl });
    const result = await provider.runTask(apiTask, {
      project_path: dir,
      iteration_id: 'i_minimax',
      recent_events: [],
    });

    expect(calls).toBe(2);
    expect(result.status).toBe('completed');
    expect(result.summary).toContain('MiniMax deterministic fallback');
    expect(result.risks).toContain('minimax_deterministic_fallback_used');
    expect(await fs.readFile(path.join(dir, 'docs', 'api-contract.md'), 'utf8')).toContain('API Contract');
  });

  it('accepts base64 file content from repair prompts to avoid JSON string escaping drift', async () => {
    const dir = await tmp();
    const readme = '# Provtest\n\n## Install\n\nnpm install\n\n## Usage\n\nRun "npm start".\n';
    let calls = 0;
    let repairSystemPrompt = '';
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      if (calls === 2) repairSystemPrompt = body.messages.find((m: { role: string }) => m.role === 'system')?.content ?? '';
      const content = calls === 1
        ? '{"summary":"Broken payload","changed_files":["README.md"],"edits":[{"path":"README.md","content":"# Provtest\n## Install"}]}'
        : JSON.stringify({
          summary: 'Added README after base64 repair retry',
          changed_files: ['README.md'],
          edits: [{
            path: 'README.md',
            content_base64: Buffer.from(readme, 'utf8').toString('base64'),
          }],
          risks: [],
          next_steps: [],
        });
      return new Response(JSON.stringify({
        choices: [{ message: { content } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const provider = new MiniMaxProvider({ enabled: true, apiKey: 'test-key', fetchImpl });
    const result = await provider.runTask(task, {
      project_path: dir,
      iteration_id: 'i_minimax',
      recent_events: [],
    });

    expect(calls).toBe(2);
    expect(repairSystemPrompt).toContain('content_base64');
    expect(result.status).toBe('completed');
    expect(await fs.readFile(path.join(dir, 'README.md'), 'utf8')).toBe(readme);
  });

  it('retries verification repair payloads that only edit tests', async () => {
    const dir = await tmp();
    await fs.writeFile(path.join(dir, 'app.py'), 'def redact(x):\n    return x\n');
    await fs.mkdir(path.join(dir, 'tests'));
    await fs.writeFile(path.join(dir, 'tests', 'test_app.py'), 'def test_placeholder():\n    assert True\n');
    const repairTask: AgentTask = {
      id: 't_repair',
      iteration_id: 'i_minimax',
      assigned_to: 'executor',
      title: 'Repair failing project verification',
      description: 'pytest failed because app.redact does not mask a secret',
      acceptance_criteria: [
        'the root cause is fixed in source or tests',
        'the fix addresses the root cause rather than weakening or deleting tests',
      ],
      expected_changed_files: ['app.py', 'tests/test_app.py'],
      verification_commands: ['python3 -c "from app import redact; assert redact(\'secret\') == \'[redacted]\'"'],
      priority: 'blocker',
      status: 'pending',
    };
    let calls = 0;
    let secondPrompt = '';
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      if (calls === 2) secondPrompt = body.messages.find((m: { role: string }) => m.role === 'user')?.content ?? '';
      const content = calls === 1
        ? JSON.stringify({
          summary: 'Changed only the test',
          changed_files: ['tests/test_app.py'],
          edits: [{ path: 'tests/test_app.py', content: 'def test_placeholder():\n    assert True\n' }],
          risks: [],
          next_steps: [],
        })
        : JSON.stringify({
          summary: 'Fixed source redaction behavior',
          changed_files: ['app.py'],
          edits: [{ path: 'app.py', content: 'def redact(x):\n    return "[redacted]" if x == "secret" else x\n' }],
          risks: [],
          next_steps: [],
        });
      return new Response(JSON.stringify({
        choices: [{ message: { content } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const provider = new MiniMaxProvider({ enabled: true, apiKey: 'test-key', fetchImpl });
    const result = await provider.runTask(repairTask, {
      project_path: dir,
      iteration_id: 'i_minimax',
      recent_events: [],
    });

    expect(calls).toBe(2);
    expect(secondPrompt).toContain('only changed test files');
    expect(result.status).toBe('completed');
    expect(result.changed_files).toEqual(['app.py']);
    expect(await fs.readFile(path.join(dir, 'app.py'), 'utf8')).toContain('[redacted]');
  });

  it('rejects semantic drift edits that replace domain prompts with an unrelated product domain', async () => {
    const dir = await tmp();
    const originalPrompts = [
      'ROLE_DESC = {',
      '    "werewolf": "狼人 - 夜晚和队友一起选择杀人",',
      '    "seer": "预言家 - 每晚可以查验一名玩家",',
      '}',
      'def build_system_prompt(pid, role, mode_info):',
      '    return "狼人杀 agent theater"',
      '',
    ].join('\n');
    await fs.writeFile(path.join(dir, 'prompts.py'), originalPrompts);
    const driftTask: AgentTask = {
      id: 't_semantic_drift',
      iteration_id: 'i_minimax',
      assigned_to: 'executor',
      title: 'Repair failed verification: python3 -m pytest -q',
      description: 'pytest failed while importing prompts.py; preserve the werewolf agent theater domain.',
      acceptance_criteria: ['prompts.py still contains werewolf role prompts'],
      expected_changed_files: ['prompts.py'],
      verification_commands: ['grep -q 狼人 prompts.py'],
      priority: 'blocker',
      status: 'pending',
    };
    const fetchImpl = (async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            summary: 'Rewrote prompts',
            changed_files: ['prompts.py'],
            edits: [{
              path: 'prompts.py',
              content: 'def build_system_prompt(turns):\n    return "You are a helpful chess analysis assistant."\n',
            }],
            risks: [],
            next_steps: [],
          }),
        },
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch;

    const provider = new MiniMaxProvider({ enabled: true, apiKey: 'test-key', fetchImpl });
    const result = await provider.runTask(driftTask, {
      project_path: dir,
      iteration_id: 'i_minimax',
      recent_events: [],
    });

    expect(result.status).toBe('failed');
    expect(result.failures.some((failure) => failure.includes('semantic_drift_edit:prompts.py'))).toBe(true);
    expect(await fs.readFile(path.join(dir, 'prompts.py'), 'utf8')).toBe(originalPrompts);
  });

  it('rejects invalid Python syntax edits before they are written', async () => {
    const dir = await tmp();
    const originalGame = 'def vote_tally(votes):\n    return votes\n';
    await fs.writeFile(path.join(dir, 'game.py'), originalGame);
    const syntaxTask: AgentTask = {
      id: 't_syntax_guard',
      iteration_id: 'i_minimax',
      assigned_to: 'executor',
      title: 'Repair failed verification: python3 -m pytest -q',
      description: 'pytest failed while importing game.py; preserve syntactic validity.',
      acceptance_criteria: ['game.py imports cleanly'],
      expected_changed_files: ['game.py'],
      verification_commands: ['python3 -m py_compile game.py'],
      priority: 'blocker',
      status: 'pending',
    };
    const fetchImpl = (async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            summary: 'Attempted game repair',
            changed_files: ['game.py'],
            edits: [{
              path: 'game.py',
              content: 'def vote_tally(votes):\n    tally = Counter(target for target in [1, 2)\n    return tally\n',
            }],
            risks: [],
            next_steps: [],
          }),
        },
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch;

    const provider = new MiniMaxProvider({ enabled: true, apiKey: 'test-key', fetchImpl });
    const result = await provider.runTask(syntaxTask, {
      project_path: dir,
      iteration_id: 'i_minimax',
      recent_events: [],
    });

    expect(result.status).toBe('failed');
    expect(result.failures.some((failure) => failure.includes('syntax_preflight_failed:game.py'))).toBe(true);
    expect(await fs.readFile(path.join(dir, 'game.py'), 'utf8')).toBe(originalGame);
  });

  it('rejects fake Node package scaffolds that would demote a Python project', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-minimax-python-package-drift-'));
    await fs.writeFile(path.join(dir, 'app.py'), 'print("python app")\n');
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask>=3\n');
    const apiTask: AgentTask = {
      id: 't_api_contract',
      iteration_id: 'i_minimax',
      assigned_to: 'executor',
      title: 'Add API contract harness without replacing Python project identity',
      description: 'Add an API contract harness without replacing Python project identity.',
      acceptance_criteria: ['package scripts expose api:contract-check without replacing test/build validation'],
      expected_changed_files: ['docs/api-contract.md', 'scripts/api-contract-check.mjs', 'package.json'],
      verification_commands: ['node scripts/api-contract-check.mjs'],
      priority: 'high',
      status: 'pending',
    };
    const fetchImpl = (async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            summary: 'Added fake Node scaffold',
            changed_files: ['docs/api-contract.md', 'scripts/api-contract-check.mjs', 'package.json'],
            edits: [
              { path: 'docs/api-contract.md', content: '# API Contract\n' },
              { path: 'scripts/api-contract-check.mjs', content: 'process.exit(0)\n' },
              {
                path: 'package.json',
                content: JSON.stringify({
                  name: 'werewolf-ms',
                  scripts: {
                    start: 'powershell app.sh',
                    test: "echo 'Tests not implemented' && exit 0",
                    'api:contract-check': 'node scripts/api-contract-check.mjs',
                  },
                  devDeps: { eslint: '^8.0.0' },
                }, null, 2),
              },
            ],
            risks: [],
            next_steps: [],
          }),
        },
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch;

    const provider = new MiniMaxProvider({ enabled: true, apiKey: 'test-key', fetchImpl });
    const result = await provider.runTask(apiTask, {
      project_path: dir,
      iteration_id: 'i_minimax',
      recent_events: [],
    });

    expect(result.status).toBe('failed');
    expect(result.failures.some((failure) => failure.includes('python_package_scaffold_drift:package.json'))).toBe(true);
    await expect(fs.stat(path.join(dir, 'package.json'))).rejects.toBeTruthy();
  });

  it('retries API contract harness payloads that omit required docs and script edits', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-minimax-api-harness-completeness-'));
    await fs.writeFile(path.join(dir, 'app.py'), 'from flask import Flask\napp = Flask(__name__)\n@app.route("/healthz")\ndef healthz(): return "ok"\n');
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask>=3\n');
    const apiTask: AgentTask = {
      id: 't_api_contract_complete',
      iteration_id: 'i_minimax',
      assigned_to: 'executor',
      title: 'Add API contract harness with completeness retry',
      description: 'Add docs/api-contract.md and scripts/api-contract-check.mjs for the detected Flask API surface.',
      acceptance_criteria: [
        'docs/api-contract.md documents the detected API surface',
        'scripts/api-contract-check.mjs fails when no API surface evidence exists',
        'package scripts expose api:contract-check without replacing test/build validation',
      ],
      expected_changed_files: ['docs/api-contract.md', 'scripts/api-contract-check.mjs', 'package.json'],
      verification_commands: ['node scripts/api-contract-check.mjs'],
      priority: 'high',
      status: 'pending',
    };
    let calls = 0;
    let secondPrompt = '';
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      if (calls === 2) secondPrompt = body.messages.find((m: { role: string }) => m.role === 'user')?.content ?? '';
      const content = calls === 1
        ? JSON.stringify({
          summary: 'Added package script only',
          changed_files: ['package.json'],
          edits: [{
            path: 'package.json',
            content: JSON.stringify({ scripts: { 'api:contract-check': 'node scripts/api-contract-check.mjs' } }, null, 2),
          }],
          risks: [],
          next_steps: [],
        })
        : JSON.stringify({
          summary: 'Added complete API contract harness',
          changed_files: ['docs/api-contract.md', 'scripts/api-contract-check.mjs', 'package.json'],
          edits: [
            { path: 'docs/api-contract.md', content: '# API Contract\n\nDocuments /healthz.\n' },
            { path: 'scripts/api-contract-check.mjs', content: 'import { existsSync } from "node:fs";\nif (!existsSync("app.py")) process.exit(1);\n' },
            { path: 'package.json', content: JSON.stringify({ scripts: { 'api:contract-check': 'node scripts/api-contract-check.mjs' } }, null, 2) },
          ],
          risks: [],
          next_steps: [],
        });
      return new Response(JSON.stringify({
        choices: [{ message: { content } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const provider = new MiniMaxProvider({ enabled: true, apiKey: 'test-key', fetchImpl });
    const result = await provider.runTask(apiTask, {
      project_path: dir,
      iteration_id: 'i_minimax',
      recent_events: [],
    });

    expect(calls).toBe(2);
    expect(secondPrompt).toContain('API contract harness omitted required files');
    expect(result.status).toBe('completed');
    expect(result.changed_files).toEqual(['docs/api-contract.md', 'package.json', 'scripts/api-contract-check.mjs']);
  });

  it('retries brittle API contract scripts that scan for exact Python event literal formatting', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-minimax-api-harness-brittle-'));
    await fs.writeFile(path.join(dir, 'app.py'), 'from flask import Flask\napp = Flask(__name__)\n@app.route("/stream/<game_id>")\ndef stream(game_id): return "ok"\n');
    await fs.writeFile(path.join(dir, 'game.py'), 'def emit(e):\n    pass\nemit({"type": "log"})\n');
    const apiTask: AgentTask = {
      id: 't_api_contract_brittle',
      iteration_id: 'i_minimax',
      assigned_to: 'executor',
      title: 'Add API contract harness with syntax-tolerant source checks',
      description: 'Add a syntax-tolerant API contract harness for Flask/SSE source.',
      acceptance_criteria: ['scripts/api-contract-check.mjs validates source evidence without exact formatting assumptions'],
      expected_changed_files: ['docs/api-contract.md', 'scripts/api-contract-check.mjs', 'package.json'],
      verification_commands: ['node scripts/api-contract-check.mjs'],
      priority: 'high',
      status: 'pending',
    };
    let calls = 0;
    let secondPrompt = '';
    const brittleScript = [
      'import { readFileSync } from "node:fs";',
      'const game = readFileSync("game.py", "utf8");',
      'const emitCalls = ["\\"type\\": \\"speech\\"", "\\"type\\": \\"done\\""];',
      'const missing = emitCalls.filter(e => !game.includes(e));',
      'if (missing.length) process.exit(1);',
      '',
    ].join('\n');
    const robustScript = [
      'import { readFileSync } from "node:fs";',
      'const app = readFileSync("app.py", "utf8");',
      'if (!/@app\\.route\\(/.test(app)) process.exit(1);',
      '',
    ].join('\n');
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      if (calls === 2) secondPrompt = body.messages.find((m: { role: string }) => m.role === 'user')?.content ?? '';
      const script = calls === 1 ? brittleScript : robustScript;
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              summary: calls === 1 ? 'Added brittle event contract' : 'Added syntax-tolerant API contract',
              changed_files: ['docs/api-contract.md', 'scripts/api-contract-check.mjs', 'package.json'],
              edits: [
                { path: 'docs/api-contract.md', content: '# API Contract\n\nDocuments Flask/SSE boundary.\n' },
                { path: 'scripts/api-contract-check.mjs', content: script },
                { path: 'package.json', content: JSON.stringify({ scripts: { 'api:contract-check': 'node scripts/api-contract-check.mjs' } }, null, 2) },
              ],
              risks: [],
              next_steps: [],
            }),
          },
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const provider = new MiniMaxProvider({ enabled: true, apiKey: 'test-key', fetchImpl });
    const result = await provider.runTask(apiTask, {
      project_path: dir,
      iteration_id: 'i_minimax',
      recent_events: [],
    });

    expect(calls).toBe(2);
    expect(secondPrompt).toContain('brittle exact event-literal scan');
    expect(result.status).toBe('completed');
    expect(await fs.readFile(path.join(dir, 'scripts', 'api-contract-check.mjs'), 'utf8')).toBe(robustScript);
  });

  it('uses deterministic-first repair for known LLM config verification failures', async () => {
    const dir = await tmp();
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'llm_config.py'), [
      'PROVIDER_PRESETS = {',
      '    "deepseek": {"name": "DeepSeek", "base_url": "https://api.deepseek.com", "default_model": "deepseek-chat", "models": ["deepseek-chat"]},',
      '    "custom": {"name": "Custom", "base_url": "", "default_model": "", "models": []},',
      '}',
      'class LLMConfigError(ValueError): pass',
      'def redact_key(key):',
      '    if not key: return "(none)"',
      '    if len(key) <= 8: return "***"',
      '    return f"{key[:5]}...{key[-4:]}"',
      'def redact_config(config):',
      '    safe = dict(config)',
      '    if "api_key" in safe: safe["api_key"] = redact_key(safe["api_key"])',
      '    return safe',
      'def validate_llm_config(config):',
      '    if not config.get("api_key"): raise LLMConfigError("api_key required")',
      '    preset = PROVIDER_PRESETS[config.get("provider", "deepseek")]',
      '    return {"provider": config.get("provider", "deepseek"), "api_key": config["api_key"], "base_url": preset["base_url"], "model": preset["default_model"]}',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(dir, 'tests', 'test_llm_config.py'), [
      'from llm_config import redact_key',
      '',
      'def test_redaction():',
      '    assert redact_key("sk-12345678") == "sk-1...5678"',
      '',
    ].join('\n'));

    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response('{}', { status: 500 });
    }) as typeof fetch;
    const repairTask: AgentTask = {
      id: 't_llm_repair_deterministic_first',
      iteration_id: 'i_minimax',
      assigned_to: 'executor',
      title: 'Repair failed verification: python3 -m pytest tests/test_llm_config.py -q',
      description: 'tests/test_llm_config.py failed around redact_key and PROVIDER_PRESETS custom defaults.',
      acceptance_criteria: ['LLM config contract passes'],
      expected_changed_files: ['llm_config.py', 'tests/test_llm_config.py'],
      verification_commands: ['python3 -m pytest tests/test_llm_config.py -q'],
      priority: 'blocker',
      status: 'pending',
    };
    const recent: IterationEvent[] = [{
      id: 'evt_llm_config_failed',
      iteration_id: 'i_minimax',
      timestamp: '2026-05-15T00:00:00.000Z',
      agent: 'verifier',
      event_type: 'verification_failed',
      severity: 'high',
      message: 'failed: python3 -m pytest tests/test_llm_config.py -q',
      raw_output: 'FAILED tests/test_llm_config.py::TestRedactKey::test_long_key_shows_prefix_and_suffix',
    }];

    const provider = new MiniMaxProvider({ enabled: true, apiKey: 'test-key', fetchImpl });
    const result = await provider.runTask(repairTask, {
      project_path: dir,
      iteration_id: 'i_minimax',
      recent_events: recent,
    });

    expect(calls).toBe(0);
    expect(result.status).toBe('completed');
    expect(result.summary).toContain('deterministic_first_known_llm_config_repair');
    expect(result.changed_files).toEqual(expect.arrayContaining(['llm_config.py', 'tests/test_llm_config.py']));
    const llmConfig = await fs.readFile(path.join(dir, 'llm_config.py'), 'utf8');
    expect(llmConfig).toContain('def resolve_llm_config');
  });

  it('uses deterministic-first execution for player-supplied LLM provider config tasks', async () => {
    const dir = await tmp();
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response('{}', { status: 500 });
    }) as typeof fetch;
    const llmTask: AgentTask = {
      id: 't_llm_config_deterministic_first',
      iteration_id: 'i_minimax',
      assigned_to: 'executor',
      title: 'Add player-supplied LLM provider configuration',
      description: 'Players should supply provider, model, base URL and API key per session.',
      acceptance_criteria: ['provider config validates player-supplied keys without server-wide secrets'],
      expected_changed_files: ['llm_config.py', 'tests/test_llm_config.py'],
      verification_commands: ['python3 -m pytest tests/test_llm_config.py -q'],
      priority: 'high',
      status: 'pending',
    };

    const provider = new MiniMaxProvider({ enabled: true, apiKey: 'test-key', fetchImpl });
    const result = await provider.runTask(llmTask, {
      project_path: dir,
      iteration_id: 'i_minimax',
      recent_events: [],
    });

    expect(calls).toBe(0);
    expect(result.status).toBe('completed');
    expect(result.summary).toContain('deterministic_first_known_llm_provider_config_task');
    expect(await fs.readFile(path.join(dir, 'llm_config.py'), 'utf8')).toContain('public_provider_config');
  });

  it('uses deterministic-first execution for mechanical Python smoke harness tasks', async () => {
    const dir = await tmp();
    await fs.writeFile(path.join(dir, 'game.py'), 'def main():\n    return "ok"\n');
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response('{}', { status: 500 });
    }) as typeof fetch;
    const smokeTask: AgentTask = {
      id: 't_python_smoke_deterministic_first',
      iteration_id: 'i_minimax',
      assigned_to: 'executor',
      title: 'Add Python smoke tests',
      description: 'Add a minimal pytest smoke harness that validates Python source syntax without assuming domain behavior.',
      acceptance_criteria: ['tests/test_smoke.py exists', 'pytest-compatible test command exits 0', 'Python source files compile'],
      expected_changed_files: ['tests/test_smoke.py', 'requirements.txt', 'package.json'],
      verification_commands: ['python3 -m pytest tests/test_smoke.py -q'],
      priority: 'high',
      status: 'pending',
    };

    const provider = new MiniMaxProvider({ enabled: true, apiKey: 'test-key', fetchImpl });
    const result = await provider.runTask(smokeTask, {
      project_path: dir,
      iteration_id: 'i_minimax',
      recent_events: [],
    });

    expect(calls).toBe(0);
    expect(result.status).toBe('completed');
    expect(result.summary).toContain('deterministic_first_mechanical_python_smoke_harness');
    const smoke = await fs.readFile(path.join(dir, 'tests', 'test_smoke.py'), 'utf8');
    expect(smoke).toContain('ast.parse');
    expect(smoke).not.toContain('m7');
  });

  it('uses deterministic-first execution for mechanical contract harness tasks', async () => {
    const dir = await tmp();
    await fs.writeFile(path.join(dir, 'app.py'), 'from flask import Flask\napp = Flask(__name__)\n@app.route("/healthz")\ndef healthz(): return "ok"\n');
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response('{}', { status: 500 });
    }) as typeof fetch;
    const contractTask: AgentTask = {
      id: 't_contract_harness_deterministic_first',
      iteration_id: 'i_minimax',
      assigned_to: 'executor',
      title: 'Add API contract harness',
      description: 'Add docs/api-contract.md and scripts/api-contract-check.mjs for the detected Flask API surface.',
      acceptance_criteria: ['docs/api-contract.md and scripts/api-contract-check.mjs are created together'],
      expected_changed_files: ['docs/api-contract.md', 'scripts/api-contract-check.mjs', 'package.json'],
      verification_commands: ['node scripts/api-contract-check.mjs'],
      priority: 'high',
      status: 'pending',
    };

    const provider = new MiniMaxProvider({ enabled: true, apiKey: 'test-key', fetchImpl });
    const result = await provider.runTask(contractTask, {
      project_path: dir,
      iteration_id: 'i_minimax',
      recent_events: [],
    });

    expect(calls).toBe(0);
    expect(result.status).toBe('completed');
    expect(result.summary).toContain('deterministic_first_mechanical_contract_harness');
    expect(await fs.readFile(path.join(dir, 'docs', 'api-contract.md'), 'utf8')).toContain('API Contract');
    expect(await fs.readFile(path.join(dir, 'scripts', 'api-contract-check.mjs'), 'utf8')).not.toContain('__dirname');
  });

  it('uses deterministic-first execution for known rule-based product tasks', async () => {
    const dir = await tmp();
    await fs.writeFile(path.join(dir, 'README.md'), '# Agent Werewolf\n\nAgent-facing social deduction demo.\n');
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'agent-werewolf', scripts: {} }, null, 2));
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response('{}', { status: 500 });
    }) as typeof fetch;
    const evaluationTask: AgentTask = {
      id: 't_known_rule_based_market_gap',
      iteration_id: 'i_minimax',
      assigned_to: 'executor',
      title: 'Close market capability gap: Agent evaluation harness',
      description: 'Implement seeded replay/evaluation behavior from source-backed market research.',
      acceptance_criteria: ['evaluation harness exists as product behavior'],
      expected_changed_files: ['evaluation.py', 'replay.py', 'tests/test_eval_harness.py', 'tests/test_replay.py', 'docs/agent-evaluation.md', 'README.md', 'package.json'],
      verification_commands: ['python3 -m pytest tests/test_eval_harness.py tests/test_replay.py -q'],
      priority: 'high',
      status: 'pending',
    };

    const provider = new MiniMaxProvider({ enabled: true, apiKey: 'test-key', fetchImpl });
    const result = await provider.runTask(evaluationTask, {
      project_path: dir,
      iteration_id: 'i_minimax',
      recent_events: [],
    });

    expect(calls).toBe(0);
    expect(result.status).toBe('completed');
    expect(result.summary).toContain('deterministic_first_known_rule_based_product_task');
    expect(await fs.readFile(path.join(dir, 'evaluation.py'), 'utf8')).toContain('AgentEvaluationHarness');
    expect(await fs.readFile(path.join(dir, 'replay.py'), 'utf8')).toContain('JsonlReplayStore');
  });

  it('uses deterministic-first repair for known API contract harness failures', async () => {
    const dir = await tmp();
    await fs.writeFile(path.join(dir, 'app.py'), 'from flask import Flask\napp = Flask(__name__)\n@app.route("/start", methods=["POST"])\ndef start(): return "ok"\n');
    await fs.mkdir(path.join(dir, 'scripts'), { recursive: true });
    await fs.writeFile(path.join(dir, 'scripts', 'api-contract-check.mjs'), 'console.log(__dirname)\n');
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response('{}', { status: 500 });
    }) as typeof fetch;
    const repairTask: AgentTask = {
      id: 't_api_contract_repair_deterministic_first',
      iteration_id: 'i_minimax',
      assigned_to: 'executor',
      title: 'Repair failed verification: node scripts/api-contract-check.mjs',
      description: '__dirname is not defined in ES module scope and documented endpoints did not match source.',
      acceptance_criteria: ['API contract check passes'],
      expected_changed_files: ['docs/api-contract.md', 'scripts/api-contract-check.mjs', 'package.json'],
      verification_commands: ['node scripts/api-contract-check.mjs'],
      priority: 'blocker',
      status: 'pending',
    };
    const provider = new MiniMaxProvider({ enabled: true, apiKey: 'test-key', fetchImpl });
    const result = await provider.runTask(repairTask, {
      project_path: dir,
      iteration_id: 'i_minimax',
      recent_events: [{
        id: 'evt_api_contract_failed',
        iteration_id: 'i_minimax',
        timestamp: '2026-05-15T00:00:00.000Z',
        agent: 'verifier',
        event_type: 'verification_failed',
        severity: 'high',
        message: 'failed: node scripts/api-contract-check.mjs',
        raw_output: 'ReferenceError: __dirname is not defined in ES module scope',
      }],
    });

    expect(calls).toBe(0);
    expect(result.status).toBe('completed');
    expect(result.summary).toContain('deterministic_first_known_api_contract_repair');
    expect(await fs.readFile(path.join(dir, 'scripts', 'api-contract-check.mjs'), 'utf8')).not.toContain('__dirname');
  });
});
