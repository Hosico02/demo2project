import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { gap } from '../src/cli/commands/gap.js';

async function captureStdout(fn: () => Promise<number>): Promise<{ code: number; stdout: string }> {
  const original = process.stdout.write;
  let stdout = '';
  process.stdout.write = ((chunk: unknown) => {
    stdout += String(chunk);
    return true;
  }) as typeof process.stdout.write;
  try {
    const code = await fn();
    return { code, stdout };
  } finally {
    process.stdout.write = original;
  }
}

describe('gap CLI command', () => {
  it('runs evidence verification by default and supports explicit fast static scan', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-cli-gap-verify-'));
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'README.md'), '# Python Demo\n\nA small demo with a deliberately failing test.\n' + 'x'.repeat(420));
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'pytest>=8.0.0\n');
    await fs.writeFile(path.join(dir, 'app.py'), 'def main():\n    return "ok"\n');
    await fs.writeFile(path.join(dir, 'tests', 'test_app.py'), 'def test_failure():\n    assert False\n');

    const verified = await captureStdout(() => gap({ project: dir }));
    const fast = await captureStdout(() => gap({ project: dir, fast: true }));

    expect(verified.code).toBe(0);
    expect(verified.stdout).toContain('failed_test_verification');
    expect(verified.stdout).toContain('test command failed');
    expect(fast.code).toBe(0);
    expect(fast.stdout).not.toContain('failed_test_verification');
  });
});
