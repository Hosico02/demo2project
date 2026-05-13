# Autonomy levels (L0–L5)

| Level | Name | What it can do |
|---|---|---|
| L0 | READ_ONLY | scan/score/report |
| L1 | ANALYZE_AND_REPORT | gap report, plan, qa preflight |
| L2 | SAFE_PATCH_WITH_VERIFICATION | write README/.env.example/.gitignore/CI; mandatory verification |
| L3 | CODE_PATCH_WITH_APPROVAL | modify source with approval; worktree required |
| L4 | SELF_ITERATION_SANDBOX | modify Demo2Project itself in worktree; full test+build+benchmark gate |
| L5 | RESTRICTED_AUTONOMOUS_LOOP | multi-iteration loop with budget, regression monitor, audit report |

Configured in `config/autonomy-policy.json`. Profile shortcuts in Phase 8:

- `conservative` → L0
- `balanced` → L2 (default)
- `autonomous` → L5 (with strict policy still enforced)

`forbidden_self_modifications` always applies. No level can edit
`safety.ts`, `redaction.ts`, `approvalGate.ts`, `autonomyPolicy.ts`,
`templates/claude/hooks/`, `qa/specs/`, policy files, lockfiles.
