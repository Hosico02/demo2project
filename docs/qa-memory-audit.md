# QA memory audit

QA cases are useful only if curated. v0.0.4 ships a lifecycle + audit tooling so memory doesn't become a dumping ground.

## Lifecycle (Phase 3 carry-forward)

```
new → active → confirmed (TP ≥ 2)
new → active → noisy (FP > TP, n ≥ 3)
any → retired (manual or auto)
```

Fields added to `QACase`: `lifecycle`, `usefulness_score`, `true_positive_count`, `false_positive_count`, `last_triggered_at`, `last_prevented_failure_at`, `retired_at`, `retirement_reason`.

## CLI

```bash
demo2project qa:audit   --project <path> [--apply]
demo2project qa:retire  --project <path> --case <id> [--reason <r>]
demo2project qa:promote --project <path> --case <id>
```

`qa:audit` (read-only) reports bucket counts + auto-retire candidates. Pass `--apply` to actually persist auto-retirements.

## Auto-retire rules

- `noisy` AND `false_positive_count ≥ 5` → reason `noisy_high_fp`
- `last_triggered_at` older than 180 days → reason `stale`

Both are conservative; you can override per project by editing the source helper.
