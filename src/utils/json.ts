import { readTextSafe, writeText } from './fs.js';

export async function readJsonSafe<T>(path: string): Promise<T | null> {
  const txt = await readTextSafe(path);
  if (txt === null) return null;
  try {
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await writeText(path, JSON.stringify(value, null, 2) + '\n');
}

export function safeStringify(value: unknown, maxLen = 4000): string {
  let out: string;
  try {
    out = JSON.stringify(value);
  } catch {
    out = String(value);
  }
  if (out.length > maxLen) {
    return out.slice(0, maxLen) + `... [truncated ${out.length - maxLen} chars]`;
  }
  return out;
}
