import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import type { VerificationResult } from './types.js';
import { checkCommandSafety } from './safety.js';
import { summarizeOutput } from './redaction.js';

export interface RunOptions {
  cwd: string;
  timeoutMs?: number;
  env?: Record<string, string>;
}

export interface RunResult extends VerificationResult {}

const DEFAULT_TIMEOUT = 120_000;

/**
 * Run a shell command and return a VerificationResult. Always returns —
 * never throws — so callers can treat failures as data.
 *
 * Safety: dangerous commands (per src/core/safety.ts) are blocked before spawn.
 */
export async function runCommand(
  command: string,
  options: RunOptions,
): Promise<RunResult> {
  const safety = checkCommandSafety(command);
  if (!safety.allowed) {
    return {
      command,
      exit_code: -1,
      stdout_summary: '',
      stderr_summary: `[blocked by safety policy] ${safety.reason ?? 'unsafe command'}`,
      passed: false,
      duration_ms: 0,
      failure_reason: `unsafe_command_blocked:${safety.reason ?? 'unknown'}`,
    };
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT;
  const started = performance.now();

  return new Promise<RunResult>((resolve) => {
    const child = spawn(command, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env ?? {}) },
      shell: true,
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGKILL');
      } catch {
        /* noop */
      }
    }, timeoutMs);

    child.stdout?.on('data', (d) => {
      stdout += d.toString();
      if (stdout.length > 200_000) stdout = stdout.slice(-200_000);
    });
    child.stderr?.on('data', (d) => {
      stderr += d.toString();
      if (stderr.length > 200_000) stderr = stderr.slice(-200_000);
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        command,
        exit_code: -1,
        stdout_summary: summarizeOutput(stdout),
        stderr_summary: summarizeOutput(stderr + '\n' + err.message),
        passed: false,
        duration_ms: Math.round(performance.now() - started),
        failure_reason: `spawn_error:${err.message}`,
      });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const duration = Math.round(performance.now() - started);
      const exit = code ?? -1;
      const passed = exit === 0 && !timedOut;
      resolve({
        command,
        exit_code: exit,
        stdout_summary: summarizeOutput(stdout),
        stderr_summary: summarizeOutput(stderr),
        passed,
        duration_ms: duration,
        failure_reason: timedOut
          ? `timeout_after_${timeoutMs}ms`
          : passed
            ? undefined
            : `exit_code_${exit}`,
      });
    });
  });
}
