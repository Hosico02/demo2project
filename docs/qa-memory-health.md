# QA memory health

QA memory degrades unless curated. `QAMemoryHealthManager` provides:

- `memory_noise_score` — fraction of cases that are noisy / retire-recommended
- `memory_usefulness_score` — sum of `usefulness_score` across cases
- `duplicate_clusters` via QASimilarity
- `recommended_merges` / `recommended_retirements` / `recommended_promotions`

## CLI

```bash
demo2project qa:health           --project ./path
demo2project qa:compact          --project ./path [--apply]
demo2project qa:merge            --project ./path --case-a <id> --case-b <id>
demo2project qa:retire-stale     --project ./path
demo2project qa:report-memory    --project ./path   # alias for qa:health
```

## Auto-retire policy

- `noisy` cases with `false_positive_count >= 5` → retire reason `noisy_high_fp`
- cases with `last_triggered_at` older than 180 days → retire reason `stale`

`qa:compact` is read-only unless you pass `--apply`.
