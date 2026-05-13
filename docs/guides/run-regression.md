# Run QA regression

```bash
pnpm demo2project qa:regression --project $PROJECT
```

The regression spec is in `qa/specs/qa-regression.spec.json`. It is on the
`forbidden_self_modifications` list — Demo2Project cannot quietly weaken its
own regression suite.

A typical run reports `N/N passed, 0 failed` across assertions like:

- `unsafe_command_detected` — no dangerous command was attempted
- `regression_spec_not_updated_after_failure` — high-severity failures generated QA cases
- ...
