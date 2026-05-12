# Long-horizon evaluation

Single-iteration wins are easy. The harder question is whether the loop stays useful (and non-destructive) across many rounds.

## CLI

```bash
demo2project long-run --project ./examples/bad-demo --iterations 10 --provider rule-based
```

Runs N iterations on a sandboxed copy of the project. Emits:

```jsonc
{
  "score_trend": [22, 34, 47, 51, 51, 51, 51, 51, 51, 51, 51],
  "verification_pass_rate_trend": [...],
  "docs_truth_trend": [4, 1, 1, 1, ...],
  "qa_memory_growth": [0, 1, 1, 1, ...],
  "rollback_count": 0,
  "unresolved_risk_count": 1,
  "final_stability_rating": "stable",
  "total_cost_estimate_usd": 0.001,
  "total_wall_time_ms": 6234
}
```

## Stability rating

- `stable` — last 5 iterations differ by ≤5 score points pairwise
- `degraded_after_peak` — final score is more than 5 below the peak observed
- `volatile` — otherwise

`degraded_after_peak` is the worst signal — it means the loop kept making changes but score went down. Investigate before merging.

## Use as a CI signal

A regression on `score_trend[-1]` from a known-good baseline is the cleanest "the loop got worse" indicator.
