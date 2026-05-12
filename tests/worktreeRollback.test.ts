import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { IterationWorkspace } from '../src/core/iterationWorkspace.js';
import { runCommand } from '../src/core/commandRunner.js';

async function makeRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-ws-'));
  await runCommand('git init -b main', { cwd: dir });
  await runCommand('git config user.email demo@d2p && git config user.name demo', { cwd: dir });
  await fs.writeFile(path.join(dir, 'a.txt'), 'hello\n');
  await runCommand('git add . && git commit -m init --no-verify --no-gpg-sign', { cwd: dir });
  return dir;
}

describe('IterationWorkspace', () => {
  let repo: string;
  beforeEach(async () => { repo = await makeRepo(); });

  it('creates an iter branch and restores base on rollback', async () => {
    const ws = new IterationWorkspace(repo);
    const begin = await ws.begin('test1');
    expect(begin.enabled).toBe(true);
    expect(begin.manifest?.iter_branch).toBe('demo2project/iter-test1');
    // make a change
    await fs.writeFile(path.join(repo, 'a.txt'), 'changed\n');
    await runCommand('git add . && git commit -m "iter change" --no-verify --no-gpg-sign', { cwd: repo });
    const finalized = await ws.finalize({ iterationId: 'test1', success: false });
    expect(finalized?.outcome).toBe('rolled_back');
    // base branch should be unchanged
    const log = await runCommand('git log --oneline', { cwd: repo });
    expect(log.stdout_summary).toContain('init');
    expect(log.stdout_summary).not.toContain('iter change');
    const txt = await fs.readFile(path.join(repo, 'a.txt'), 'utf8');
    expect(txt).toBe('hello\n');
  });

  it('finalize success commits to iter branch and returns to base', async () => {
    const ws = new IterationWorkspace(repo);
    await ws.begin('test2');
    await fs.writeFile(path.join(repo, 'b.txt'), 'new\n');
    const finalized = await ws.finalize({ iterationId: 'test2', success: true });
    expect(finalized?.outcome).toBe('success');
    // currently on main branch
    const branch = await runCommand('git rev-parse --abbrev-ref HEAD', { cwd: repo });
    expect(branch.stdout_summary.trim()).toBe('main');
    // iter branch exists and has the commit
    const branches = await runCommand('git branch --list demo2project/iter-test2', { cwd: repo });
    expect(branches.stdout_summary).toContain('demo2project/iter-test2');
  });

  it('reports disabled on non-git dir', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-ws-nogit-'));
    const ws = new IterationWorkspace(dir);
    const r = await ws.begin('iterX');
    expect(r.enabled).toBe(false);
    expect(r.reason).toBe('not_a_git_repo');
  });
});
