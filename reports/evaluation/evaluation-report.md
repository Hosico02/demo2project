# Demo2Project — A/B Evaluation Report

Generated: 2026-05-12T10:35:38.229Z

## Summary

- Cases evaluated: **8**
- demo2project wins: **6**
- baseline-equivalent: **2**
- inconclusive: **0**
- average score Δ (demo2project − baseline): **7.6**

## Per-case comparison

| case | standard | baseline (before→after) | demo2project (before→after) | Δ | baseline unverified | demo2project unverified | baseline docs lies | demo2project docs lies | qa cases | verdict |
|------|----------|-------------------------|------------------------------|---|---------------------|--------------------------|---------------------|-------------------------|----------|---------|
| bad-docs-project | node-cli | 27→38 (working_demo) | 27→41 (working_demo) | +3 | 4 | 0 | 5 | 4 | 0 | baseline_equivalent |
| bad-fastapi-api | python-package | 23→33 (working_demo) | 23→40 (working_demo) | +7 | 3 | 0 | 6 | 2 | 0 | demo2project_wins |
| bad-monorepo | node-cli | 18→26 (raw_demo) | 18→37 (working_demo) | +11 | 4 | 0 | 6 | 1 | 0 | demo2project_wins |
| bad-next-app | nextjs-app | 12→20 (raw_demo) | 12→31 (working_demo) | +11 | 3 | 0 | 6 | 1 | 0 | demo2project_wins |
| bad-node-cli | node-cli | 18→26 (raw_demo) | 18→37 (working_demo) | +11 | 4 | 0 | 6 | 1 | 0 | demo2project_wins |
| bad-python-cli | python-package | 24→34 (working_demo) | 24→35 (working_demo) | +1 | 3 | 0 | 6 | 2 | 0 | baseline_equivalent |
| bad-react-app | react-app | 19→32 (working_demo) | 19→38 (working_demo) | +6 | 4 | 0 | 5 | 1 | 0 | demo2project_wins |
| bad-ts-library | node-cli | 23→31 (working_demo) | 23→42 (working_demo) | +11 | 4 | 0 | 6 | 1 | 0 | demo2project_wins |

## Interpretation

A higher Δ means Demo2Project ended at a higher project-readiness score than a naive baseline path applying the same planner output without verification.

The columns that matter most for the *control-layer* thesis are:

- **unverified_changes**: count of file-change events without an accompanying verification command. Demo2Project should be 0; baseline should be > 0.
- **docs_false_claims**: number of README commands that have no implementation. Demo2Project keeps this lower because RuleBasedExecutor produces concrete scripts; baseline writes overclaiming READMEs.
- **qa cases**: how many failure-mode fingerprints the disciplined loop learned. Baseline = 0 (no learning).
