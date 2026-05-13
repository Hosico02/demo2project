import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileExists } from '../../utils/fs.js';
import { AnalyzerAgent } from '../../agents/AnalyzerAgent.js';

export interface ExampleEntry {
  id: string;
  path: string;
  has_readme: boolean;
}

export async function list(systemRoot: string): Promise<ExampleEntry[]> {
  const dir = path.join(systemRoot, 'examples');
  if (!fileExists(dir)) return [];
  let entries: string[] = [];
  try { entries = await fs.readdir(dir); } catch { return []; }
  const out: ExampleEntry[] = [];
  for (const e of entries) {
    const p = path.join(dir, e);
    try {
      const stat = await fs.stat(p);
      if (!stat.isDirectory()) continue;
      out.push({ id: e, path: p, has_readme: fileExists(path.join(p, 'README.md')) });
    } catch { /* ok */ }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export async function runExample(systemRoot: string, id: string): Promise<{ id: string; score: number; grade: string; findings: number }> {
  const all = await list(systemRoot);
  const ex = all.find((e) => e.id === id);
  if (!ex) throw new Error(`example ${id} not found`);
  const a = new AnalyzerAgent();
  const r = await a.fullAnalyze(ex.path);
  return { id, score: r.score.total, grade: r.score.grade, findings: r.gap.findings.length };
}

export async function reportExample(systemRoot: string, id: string): Promise<{ id: string; expected: string; actual: { score: number; grade: string; findings: number } }> {
  const r = await runExample(systemRoot, id);
  return {
    id,
    expected: 'snapshot + gap report should run; no errors',
    actual: { score: r.score, grade: r.grade, findings: r.findings },
  };
}
