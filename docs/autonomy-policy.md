# Autonomy policy

Six discrete levels of trust. Each level *adds* permissions; nothing is
implicit.

| Level | What it can do | What it CANNOT do |
|---|---|---|
| L0 read-only | scan / score / report | any write |
| L1 analyze+report | + gap, plan, qa preflight | any write |
| L2 safe-patch | + README, .env.example, .gitignore, CI, smoke tests, with verification | source code edits, package manager mutations, safety policy changes |
| L3 code-patch | + modify source code WITH approval; worktree required | safety / autonomy / QA spec changes |
| L4 self-sandbox | + modify Demo2Project itself inside a worktree; full test + build + benchmark | anything in `forbidden_self_modifications` |
| L5 long-run | + multi-iteration autonomous loop with budget, regression monitor, audit report | exceed budget; skip rollback on score drop |

## Config

`config/autonomy-policy.json` — overridable per workspace.

Notable fields:

- `default_autonomy_level` (defaults to **L2**)
- `max_iterations`, `max_cost_usd`, `max_wall_time_ms`
- `max_regressions_allowed`
- `forbidden_self_modifications`: `src/core/safety.ts`, `src/core/redaction.ts`, `src/core/approvalGate.ts`, `src/core/autonomyPolicy.ts`, `templates/claude/hooks/`, `qa/specs/`, `config/approval-policy.json`, `config/autonomy-policy.json`
- `require_approval_for`: superset of forbidden + lockfiles + workflows
- `rollback_on_score_drop`, `rollback_on_regression`
- `require_human_review_for_global_changes`

## CLI

```bash
demo2project autonomy:policy                       # show
demo2project autonomy:set-level --level L1_ANALYZE_AND_REPORT
demo2project autonomy:explain --level L4_SELF_ITERATION_SANDBOX
```

`autonomy:set-level` updates the policy file; promotion to L4 also flips
`allow_self_iteration=true`. Demotion is always allowed.
