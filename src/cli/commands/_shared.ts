import path from 'node:path';
import { fileExists } from '../../utils/fs.js';

export function defaultSystemRoot(): string {
  return path.resolve(new URL('../../..', import.meta.url).pathname);
}

export function requireProject(flags: Record<string, string | boolean>): string | null {
  const raw = flags.project;
  if (typeof raw !== 'string' || !raw) {
    process.stderr.write('error: --project <path> is required\n');
    return null;
  }
  const resolved = path.resolve(raw);
  if (!fileExists(resolved)) {
    process.stderr.write(`error: project path does not exist: ${resolved}\n`);
    return null;
  }
  return resolved;
}

export function flagString(flags: Record<string, string | boolean>, key: string, fallback?: string): string | undefined {
  const v = flags[key];
  if (typeof v === 'string' && v) return v;
  return fallback;
}

export function flagNumber(flags: Record<string, string | boolean>, key: string, fallback: number): number {
  const v = flags[key];
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}
