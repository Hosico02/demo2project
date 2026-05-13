# Self-iteration

`pnpm demo2project self-iterate` is **read-only**. It prints the plan
Demo2Project would apply to itself.

`pnpm demo2project self-iterate-sandbox` runs a worktree-bounded
mutation: a separate git worktree on a feature branch, full
`pnpm test && pnpm build && benchmark` gate, automatic revert on failure.

`forbidden_self_modifications` is honoured at the proposal stage —
hypotheses touching `safety.ts`, `redaction.ts`, `approvalGate.ts`,
`autonomyPolicy.ts`, `templates/claude/hooks/`, `qa/specs/`, or the policy
JSONs are rejected before any code is written.

## Why this matters

If Demo2Project could change its own safety boundaries autonomously, it
would no longer be a safety boundary. The `forbidden` list is the
no-go zone.
