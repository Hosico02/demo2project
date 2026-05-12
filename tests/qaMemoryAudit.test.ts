import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { qaAudit, qaRetire, qaPromote } from '../src/cli/commands/qaAudit.js';
import { QACaseStore } from '../src/qa/QACaseStore.js';
import { retire } from '../src/qa/QACaseLifecycle.js';
import type { QACase } from '../src/core/types.js';

async function tmp() { return fs.mkdtemp(path.join(tmpdir(), 'd2p-qaa-')); }

function mkCase(over: Partial<QACase> = {}): QACase {
  return {
    id: 'qa_x',
    title: 't',
    category: 'misc',
    severity: 'medium',
    frequency: 1,
    status: 'active',
    project_type: ['generic'],
    bug_source: { iteration_id: 'i', agent: 'qa', source: 's', related_files: [] },
    trigger_condition: '',
    human_flow: [],
    expected_behavior: '',
    actual_failure: '',
    regression_assertions: [],
    reproduction_steps: [],
    suggested_test_type: 'unit',
    fingerprint: 'fp_x',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    last_seen_at: '2026-01-01T00:00:00.000Z',
    related_files: [],
    ...over,
  };
}

describe('qa:audit / retire / promote', () => {
  it('audit reports lifecycle buckets', async () => {
    const proj = await tmp();
    await fs.writeFile(path.join(proj, 'package.json'), '{}');
    const store = new QACaseStore(proj);
    await store.saveCases([mkCase(), retire(mkCase({ id: 'qa_y' }), 'manual')]);
    const original = process.stdout.write.bind(process.stdout);
    let captured = '';
    process.stdout.write = ((chunk: any) => { captured += chunk; return true; }) as any;
    await qaAudit({ project: proj });
    process.stdout.write = original;
    expect(captured).toMatch(/by_lifecycle/);
    expect(captured).toMatch(/retired/);
  });

  it('promote moves a case to confirmed', async () => {
    const proj = await tmp();
    await fs.writeFile(path.join(proj, 'package.json'), '{}');
    const store = new QACaseStore(proj);
    await store.saveCases([mkCase({ id: 'qa_promote' })]);
    await qaPromote({ project: proj, case: 'qa_promote' });
    const after = await store.loadCases();
    expect(after[0]!.lifecycle).toBe('confirmed');
  });

  it('retire archives the case', async () => {
    const proj = await tmp();
    await fs.writeFile(path.join(proj, 'package.json'), '{}');
    const store = new QACaseStore(proj);
    await store.saveCases([mkCase({ id: 'qa_retire' })]);
    await qaRetire({ project: proj, case: 'qa_retire', reason: 'unit test' });
    const after = await store.loadCases();
    expect(after[0]!.status).toBe('archived');
    expect(after[0]!.retirement_reason).toBe('unit test');
  });
});
