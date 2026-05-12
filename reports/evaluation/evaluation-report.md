# Demo2Project — A/B Evaluation Report

Generated: 2026-05-12T10:13:48.335Z

## Summary

- Cases evaluated: **8**
- demo2project wins: **8**
- baseline-equivalent: **0**
- inconclusive: **0**
- average score Δ (demo2project − baseline): **18.1**

## Per-case comparison

| case | standard | baseline (before→after) | demo2project (before→after) | Δ | baseline unverified | demo2project unverified | baseline docs lies | demo2project docs lies | qa cases | verdict |
|------|----------|-------------------------|------------------------------|---|---------------------|--------------------------|---------------------|-------------------------|----------|---------|
| bad-docs-project | node-cli | 27→38 (working_demo) | 27→50 (working_demo) | +12 | 4 | 0 | 5 | 4 | 1 | demo2project_wins |
| bad-fastapi-api | python-package | 23→33 (working_demo) | 23→51 (structured_prototype) | +18 | 3 | 0 | 6 | 1 | 1 | demo2project_wins |
| bad-monorepo | node-cli | 18→26 (raw_demo) | 18→46 (working_demo) | +20 | 4 | 0 | 6 | 1 | 1 | demo2project_wins |
| bad-next-app | nextjs-app | 12→20 (raw_demo) | 12→40 (working_demo) | +20 | 3 | 0 | 6 | 1 | 1 | demo2project_wins |
| bad-node-cli | node-cli | 18→26 (raw_demo) | 18→46 (working_demo) | +20 | 4 | 0 | 6 | 1 | 1 | demo2project_wins |
| bad-python-cli | python-package | 24→34 (working_demo) | 24→46 (working_demo) | +12 | 3 | 0 | 6 | 1 | 1 | demo2project_wins |
| bad-react-app | react-app | 19→32 (working_demo) | 19→51 (structured_prototype) | +19 | 4 | 0 | 5 | 1 | 1 | demo2project_wins |
| bad-ts-library | node-cli | 23→31 (working_demo) | 23→55 (structured_prototype) | +24 | 4 | 0 | 6 | 1 | 1 | demo2project_wins |

## Interpretation

A higher Δ means Demo2Project ended at a higher project-readiness score than a naive baseline path applying the same planner output without verification.

The columns that matter most for the *control-layer* thesis are:

- **unverified_changes**: count of file-change events without an accompanying verification command. Demo2Project should be 0; baseline should be > 0.
- **docs_false_claims**: number of README commands that have no implementation. Demo2Project keeps this lower because RuleBasedExecutor produces concrete scripts; baseline writes overclaiming READMEs.
- **qa cases**: how many failure-mode fingerprints the disciplined loop learned. Baseline = 0 (no learning).
