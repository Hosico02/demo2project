# Demo2Project — A/B Evaluation Report

Generated: 2026-05-12T11:16:08.646Z

## Summary

- Cases evaluated: **1**
- demo2project wins: **1**
- baseline-equivalent: **0**
- inconclusive: **0**
- average score Δ (demo2project − baseline): **11.0**

## Per-case comparison

| case | standard | baseline (before→after) | demo2project (before→after) | Δ | baseline unverified | demo2project unverified | baseline docs lies | demo2project docs lies | qa cases | verdict |
|------|----------|-------------------------|------------------------------|---|---------------------|--------------------------|---------------------|-------------------------|----------|---------|
| bad-node-cli | node-cli | 18→26 (raw_demo) | 18→37 (working_demo) | +11 | 4 | 0 | 6 | 1 | 0 | demo2project_wins |

## Interpretation

A higher Δ means Demo2Project ended at a higher project-readiness score than a naive baseline path applying the same planner output without verification.

The columns that matter most for the *control-layer* thesis are:

- **unverified_changes**: count of file-change events without an accompanying verification command. Demo2Project should be 0; baseline should be > 0.
- **docs_false_claims**: number of README commands that have no implementation. Demo2Project keeps this lower because RuleBasedExecutor produces concrete scripts; baseline writes overclaiming READMEs.
- **qa cases**: how many failure-mode fingerprints the disciplined loop learned. Baseline = 0 (no learning).
