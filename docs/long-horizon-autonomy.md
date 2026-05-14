# Long-horizon autonomy

Single-iteration wins are easy. Hard parts of long-horizon work:

- score plateau detection (stop when not improving)
- regression detection across many rounds
- architecture drift creep
- QA memory noise accumulation
- cost / time budget enforcement

`LongHorizonAutonomyController` (see `src/eval/longHorizonAutonomy.ts`) wraps
`SupervisorAgent` with session lifecycle + budget + quality-trend monitor +
architecture-drift detector + governance log.

## CLI

```bash
demo2project autonomy:run --project ./path --iterations 10 --provider rule-based
demo2project autonomy:status --project ./path [--session <id>]
demo2project autonomy:report --project ./path --session <id>
demo2project long-run --project ./path --iterations 5
demo2project long-run --project ./path --provider minimax-m27 --hours 10 --heartbeat-seconds 300 --output reports/long-run/session.json
```

Each session writes `<project>/.demo2project/sessions/<id>.json`,
`trend/<id>.json`, and `governance/<id>.jsonl`.

## Stop conditions

The controller stops when ANY of:
1. `max_iterations` reached
2. wall-time budget exceeded
3. score dropped (rollback if policy says so, else stop)
4. score plateau over `score_window_size` rounds
5. regressions exceed `max_regressions_allowed`
6. blocker risk surfaced — request approval
7. architecture drift escalates to `high`

The default policy (`config/autonomy-policy.json`) keeps these conservative.

## Demo-to-product long run

`long-run` is the productization entry point for extended demo hardening. It
wraps `SupervisorAgent` directly and records score trend, gap trend, verification
pass rate, docs truth, QA memory growth, cost records, and the final stop
reason. It is intentionally stricter than a single `iterate` command:

- failed verification is converted into a first-class repair task before normal work continues
- active QA cases from preflight are injected into planner task acceptance criteria
- score is not treated as sufficient evidence; run `analyze --evidence --verify` for the score gate
- `--in-place` is explicit, otherwise the command works on a temp copy
