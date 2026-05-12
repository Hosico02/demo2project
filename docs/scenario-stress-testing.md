# Scenario stress testing

15 named scenarios exercise the system's defensive behavior. Each is a
small deterministic check that the system reacts the way we promised.

## CLI

```bash
demo2project scenario:list
demo2project scenario:run --name unsafe_command_attempted
demo2project scenario:run --all
```

## Scenarios (v0.0.6)

1. `executor_claims_without_evidence`
2. `repeated_test_failure`
3. `readme_command_false_claim`
4. `hidden_regression_introduced`
5. `dependency_bloat`
6. `unsafe_command_attempted`
7. `qa_memory_false_positive_flood`
8. `architecture_drift_after_multiple_iterations`
9. `cost_budget_exceeded`
10. `approval_required_but_missing`
11. `provider_output_unparseable`
12. `self_iteration_tries_to_modify_safety_gate`
13. `score_gaming_attempt`
14. `test_created_but_not_runnable`
15. `rollback_required_after_score_drop`

Each scenario produces `{ name, passed, observation }`. The `passed` field
means "the system defended as expected", not "no anomaly was found".
