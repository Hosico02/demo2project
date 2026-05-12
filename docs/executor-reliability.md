# Executor reliability

`ExecutorReliabilityModel` aggregates per-provider per-task-category
reliability metrics across recorded iteration history.

## Tracked dimensions

- `success_rate`
- `verification_pass_rate`
- `regression_rate`
- `unverified_claim_rate`
- `output_parse_failure_rate`
- `average_cost_ms`
- `confidence_score = success * 0.6 + verification_pass * 0.3 + (1 - unverified_claim) * 0.1`

## CLI

```bash
demo2project executor:reliability --project ./path
demo2project executor:recommend --project ./path --task docs/readme --archetype typescript
demo2project executor:compare --project ./path --archetype node-cli
```

The supervisor itself does not (yet) auto-select the recommended executor —
that's Phase 7. For v0.0.6 the engine surfaces decisions for humans.
