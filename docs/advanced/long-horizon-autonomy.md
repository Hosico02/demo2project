# Long-horizon autonomy (Phase 6 deep dive)

See `src/core/qualityTrendMonitor.ts` and `src/core/architectureDrift.ts`.

Configuration is in `config/autonomy-policy.json`. Budgets:

- `max_iterations` (default 10)
- `max_cost_usd` (default 1.0)
- `max_wall_time_ms` (default 30 min)

Stop conditions: `max_iterations`, `target_score`, `score_dropped`,
`score_plateau`, `regression_threshold`, `cost_budget`, `wall_time_budget`,
`pending_approval`.

## Diagnosing a long run

```bash
pnpm demo2project autonomy:status --project $PROJECT --session <sid>
pnpm demo2project trend:show --project $PROJECT --session <sid>
pnpm demo2project drift:check --project $PROJECT --session <sid>
pnpm demo2project autonomy:report --project $PROJECT --session <sid>
```
