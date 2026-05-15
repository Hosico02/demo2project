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
});
