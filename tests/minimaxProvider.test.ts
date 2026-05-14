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
  it('calls MiniMax M2.7 and applies returned file edits before verification', async () => {
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
    expect(body.model).toBe('MiniMax-M2.7');
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
});
