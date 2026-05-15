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
      title: 'Add API contract harness',
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
            changed_files: ['package.json'],
            edits: [{
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
            }],
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
});
