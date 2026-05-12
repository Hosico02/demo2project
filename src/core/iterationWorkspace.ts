import path from 'node:path';
import { runCommand } from './commandRunner.js';
import { writeJson, readJsonSafe } from '../utils/json.js';
import { stateDir } from '../utils/paths.js';

/**
 * IterationWorkspace — branch-based snapshot for an iteration.
 *
 * Why not full git worktrees in v0.0.2? Worktrees require parallel checkouts
 * on disk and complicate path-relative tooling. A branch+commit boundary is
 * simpler, equally rollbackable, and works for non-worktree projects.
 *
 * Workflow per iteration when `use_worktree=true`:
 *   1. Snapshot current HEAD as `base_commit`.
 *   2. Stash any unstaged changes (we restore them on rollback).
 *   3. Create branch `demo2project/iter-<iteration_id>` from HEAD.
 *   4. Checkout that branch.
 *   5. Caller runs its iteration logic.
 *   6. `finalize({ success })` either:
 *        - success: commit changes on the branch, leave branch in place,
 *          write a snapshot manifest, return to base branch.
 *        - failure: hard-reset the branch back to base_commit, return to
 *          base branch (and unstash if we stashed).
 *
 * Rollback after the fact:
 *   `rollback(projectPath, iterationId)` reads the manifest and deletes the
 *   `demo2project/iter-*` branch. Original HEAD is untouched.
 *
 * If the target is not a git repo, this whole subsystem degrades to a
 * pass-through (returns `disabled: true` from begin()).
 */

export interface WorkspaceManifest {
  iteration_id: string;
  base_branch: string | null;
  base_commit: string | null;
  iter_branch: string;
  created_at: string;
  finalized_at?: string;
  outcome?: 'success' | 'rolled_back';
  stash_ref?: string | null;
}

export interface BeginResult {
  enabled: boolean;
  reason?: string;
  manifest?: WorkspaceManifest;
}

export interface FinalizeOptions {
  iterationId: string;
  success: boolean;
}

export class IterationWorkspace {
  constructor(private projectPath: string) {}

  private async git(args: string): Promise<{ ok: boolean; stdout: string; stderr: string }> {
    const r = await runCommand(`git ${args}`, { cwd: this.projectPath, timeoutMs: 30_000 });
    return { ok: r.passed, stdout: r.stdout_summary, stderr: r.stderr_summary };
  }

  private async isGitRepo(): Promise<boolean> {
    const r = await this.git('rev-parse --is-inside-work-tree');
    return r.ok && /^true/.test(r.stdout.trim());
  }

  private manifestPath(iterationId: string): string {
    return path.join(stateDir(this.projectPath), 'workspaces', `${iterationId}.json`);
  }

  async begin(iterationId: string): Promise<BeginResult> {
    if (!(await this.isGitRepo())) {
      return { enabled: false, reason: 'not_a_git_repo' };
    }
    const head = await this.git('rev-parse HEAD');
    if (!head.ok) return { enabled: false, reason: 'no_initial_commit' };
    const baseCommit = head.stdout.trim();
    const branchInfo = await this.git('rev-parse --abbrev-ref HEAD');
    const baseBranch = branchInfo.ok ? branchInfo.stdout.trim() : null;
    const dirty = await this.git('status --porcelain');
    let stashRef: string | null = null;
    if (dirty.ok && dirty.stdout.trim().length > 0) {
      // stash so the branch starts clean
      const stash = await this.git(`stash push -u -m "demo2project:${iterationId}"`);
      if (stash.ok) stashRef = `stash@{0}`;
    }
    const iterBranch = `demo2project/iter-${iterationId}`;
    const create = await this.git(`checkout -b ${shellSafe(iterBranch)}`);
    if (!create.ok) {
      // restore stash if we created one
      if (stashRef) await this.git('stash pop');
      return { enabled: false, reason: `checkout_failed:${create.stderr.slice(0, 200)}` };
    }
    const manifest: WorkspaceManifest = {
      iteration_id: iterationId,
      base_branch: baseBranch,
      base_commit: baseCommit,
      iter_branch: iterBranch,
      created_at: new Date().toISOString(),
      stash_ref: stashRef,
    };
    await writeJson(this.manifestPath(iterationId), manifest);
    return { enabled: true, manifest };
  }

  async finalize(opts: FinalizeOptions): Promise<WorkspaceManifest | null> {
    const manifest = await readJsonSafe<WorkspaceManifest>(this.manifestPath(opts.iterationId));
    if (!manifest) return null;
    if (opts.success) {
      // Commit anything staged/unstaged on the iter branch
      const dirty = await this.git('status --porcelain');
      if (dirty.ok && dirty.stdout.trim().length > 0) {
        await this.git('add -A');
        await this.git(
          `commit -m "demo2project iteration ${opts.iterationId}" --no-verify --no-gpg-sign`,
        );
      }
      manifest.outcome = 'success';
    } else {
      // Hard reset and remove branch
      if (manifest.base_commit) {
        await this.git(`reset --hard ${shellSafe(manifest.base_commit)}`);
      }
      manifest.outcome = 'rolled_back';
    }
    // Return to base branch (best effort)
    if (manifest.base_branch) {
      await this.git(`checkout ${shellSafe(manifest.base_branch)}`);
    }
    if (!opts.success) {
      await this.git(`branch -D ${shellSafe(manifest.iter_branch)}`);
    }
    if (manifest.stash_ref) {
      // restore caller's working changes
      await this.git('stash pop');
    }
    manifest.finalized_at = new Date().toISOString();
    await writeJson(this.manifestPath(opts.iterationId), manifest);
    return manifest;
  }

  async rollback(iterationId: string): Promise<{ ok: boolean; reason?: string }> {
    if (!(await this.isGitRepo())) return { ok: false, reason: 'not_a_git_repo' };
    const manifest = await readJsonSafe<WorkspaceManifest>(this.manifestPath(iterationId));
    if (!manifest) return { ok: false, reason: 'manifest_missing' };
    // Delete the branch (force). Leaves base_commit untouched.
    const del = await this.git(`branch -D ${shellSafe(manifest.iter_branch)}`);
    manifest.outcome = 'rolled_back';
    manifest.finalized_at = new Date().toISOString();
    await writeJson(this.manifestPath(iterationId), manifest);
    return { ok: del.ok };
  }
}

function shellSafe(s: string): string {
  // we already control these strings; this is defense-in-depth
  return s.replace(/[^A-Za-z0-9_./@-]/g, '');
}
