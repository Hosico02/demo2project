# Verification gate

Implemented in `src/agents/ExecutorAgent.ts`. The rule:

> If `changed_files` is non-empty AND `commands_run` is empty AND
> `unable_to_verify_reason` is empty, **downgrade `task_status` to `failed`
> with `failure_reason: policy_violation`**.

It is the smallest possible mechanism that prevents executors from claiming
work without producing evidence. The gate file `ExecutorAgent.ts` is on the
`forbidden_self_modifications` list — Demo2Project cannot disable its own
verification gate.

## Why it matters

LLMs reliably say "I did X" even when they did not. The verification gate
turns "I did X" into a refutable claim: either the verification command ran
and passed, or the task is failed.

See `docs/security/audit-log.md` for how the gate decisions are recorded.
