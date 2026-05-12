import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { corpusAdd, corpusList, corpusRemove, corpusEvaluate, corpusReport } from '../src/eval/projectCorpus.js';

async function tmpSystem() {
  return fs.mkdtemp(path.join(tmpdir(), 'd2p-corpsys-'));
}
async function tmpProject() {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-corp-proj-'));
  await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'p', bin: { p: 'bin/p.js' } }));
  await fs.mkdir(path.join(dir, 'bin'), { recursive: true });
  await fs.writeFile(path.join(dir, 'bin/p.js'), '#!/usr/bin/env node\n');
  return dir;
}

describe('Project corpus', () => {
  let sys: string;
  let proj: string;
  beforeEach(async () => { sys = await tmpSystem(); proj = await tmpProject(); });

  it('add / list / remove cycle', async () => {
    const entry = await corpusAdd({ systemRoot: sys, projectPath: proj, name: 'tester' });
    expect(entry.path_hash.length).toBe(12);
    expect(entry.path).not.toContain('/Users/mack'); // redaction
    const list = await corpusList({ systemRoot: sys });
    expect(list.length).toBe(1);
    const removed = await corpusRemove({ systemRoot: sys, id: entry.id });
    expect(removed).toBe(true);
    expect((await corpusList({ systemRoot: sys })).length).toBe(0);
  });

  it('evaluate writes anonymized report', async () => {
    const e = await corpusAdd({ systemRoot: sys, projectPath: proj });
    // Need the source project to exist at the recorded `path` (which is the redacted version).
    // For the test, the redacted path may differ from the actual path under /private/var/folders.
    // Patch the path in the index so evaluate can find the real dir.
    const idxPath = path.join(sys, 'corpus', 'projects.json');
    const idx = JSON.parse(await fs.readFile(idxPath, 'utf8')) as { path: string }[];
    idx[0]!.path = proj;
    await fs.writeFile(idxPath, JSON.stringify(idx));

    const reports = await corpusEvaluate({ systemRoot: sys, id: e.id });
    expect(reports.length).toBe(1);
    const r = reports[0]!;
    expect(r.archetype).toBe('node-cli');
    expect(r.structure_summary.package_manager).toBeDefined();
  });

  it('report produces a markdown file', async () => {
    await corpusAdd({ systemRoot: sys, projectPath: proj });
    const r = await corpusReport({ systemRoot: sys });
    expect(r.total).toBe(1);
    const exists = await fs.stat(r.reportPath).catch(() => null);
    expect(exists).not.toBeNull();
  });
});
