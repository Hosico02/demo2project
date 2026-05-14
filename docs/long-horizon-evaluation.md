# Long-horizon evaluation

Single-iteration wins are easy. The harder question is whether the loop stays useful (and non-destructive) across many rounds.

## CLI

```bash
demo2project long-run --project ./examples/bad-demo --iterations 10 --provider rule-based
demo2project long-run --project ./werewolf-demo --provider minimax-m27 --hours 10 --in-place --output reports/long-run/werewolf.json
```

By default this runs on a sandboxed copy. Pass `--in-place` only when you
intend to mutate the target project. Long runs stop on target score, iteration
limit, duration limit, or repeated no-progress rounds.

Important flags:

- `--hours <n>` or `--max-seconds <n>`: wall-clock budget
- `--iterations <n>`: hard iteration cap
- `--target-score <n>`: stop after reaching this score with zero open gaps
- `--max-no-progress-rounds <n>`: plateau stop
- `--heartbeat-seconds <n>`: stderr progress interval
- `--output <file>`: resumable JSON report
- `--provider rule-based|mock|minimax-m27`

Emits:

```jsonc
{
  "stop_reason": "target_reached",
  "rounds_completed": 6,
  "target_score": 86,
  "final_score": 88,
  "final_gap_count": 0,
  "score_trend": [22, 34, 47, 51, 51, 51, 51, 51, 51, 51, 51],
  "gap_count_trend": [9, 7, 4, 2, 1, 1, 0],
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

For demo-to-product work, do not use score alone. Pair it with:

- `final_gap_count == 0`
- no failed verification evidence
- no score gate failure in `analyze --evidence --verify`
- process evidence from `.demo2project` or equivalent CI/QA workflow evidence
- known benchmark defect fix rate from `eval` / `benchmark`
