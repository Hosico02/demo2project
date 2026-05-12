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
