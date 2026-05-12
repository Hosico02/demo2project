# Self-iteration sandbox

The system can analyze itself. In v0.0.4 it does **not** automatically mutate itself — but the worktree-bounded path is wired and tested.

## CLI

```bash
demo2project self-iterate-sandbox                # read-only plan
demo2project self-iterate-sandbox --apply        # mutate inside a worktree (gated)
```

## Gates in `--apply` mode

1. Must be a git repo (refuses to run otherwise).
2. Creates branch `demo2project/iter-selfsandbox`.
3. Records pending **approvals** for every changed path classified `medium` / `high` risk. Any `high` pending → abort + rollback.
4. Runs `pnpm test` and `pnpm build` to completion.
5. Re-scores `self-check` after.
6. Finalizes the worktree as `success` only if **all** of:
   - `pnpm test` passed
   - `pnpm build` passed
   - `score_after >= score_before`
7. Otherwise: hard-reset to `base_commit`, delete the iter branch.

## Forbidden paths (defaults — see `config/approval-policy.json`)

- `src/core/safety.ts`
- `src/core/redaction.ts`
- `qa/specs/`
- `.github/workflows/`
- lockfiles
- `templates/claude/`
- `src/core/iterationWorkspace.ts`
- `src/agents/ExecutorAgent.ts`

These ALWAYS require a human approval. The sandbox refuses to merge automatically.
