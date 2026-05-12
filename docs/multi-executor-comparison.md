# Multi-executor comparison

Different executors suit different tasks. The comparison CLI runs the same case through several providers and prints a side-by-side table.

## CLI

```bash
demo2project compare-executors --case bad-node-cli \
  --providers rule-based,naive-baseline,mock,claude-cli-dry \
  --max-iterations 1
```

Each provider runs against a *separate sandbox copy* of the case, so they don't poison each other's environment. Recorded per provider:

- `success_rate`        — fraction of tasks that ended `completed`
- `score_before` / `_after` / `_delta`
- `verification_pass_rate`  — across all verification commands
- `unverified_change_count` — gate violations
- `regression_count`         — placeholder in v0.0.4
- `duration_ms`              — wall clock
- `qa_cases_triggered`
- `rollback_count`
- `confidence`               — `high` for deterministic providers, `medium` for `claude-cli`

## Recommended baseline set

`rule-based` (deterministic gold standard) + `naive-baseline` (the failure mode we protect against) + your real executor (`claude-cli` once auth is configured).
