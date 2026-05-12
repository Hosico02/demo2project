# Generalization evaluation

`generalize --all [--report]` aggregates anonymized corpus reports into
per-archetype performance stats:

- `projects_by_archetype`
- `success_rate_by_archetype` (grade ≥ structured_prototype)
- `failure_rate_by_archetype` (grade = raw_demo)
- `docs_truth_failure_rate`
- `weakest_archetypes` (top 3 by lowest success rate)
- `recommended_standard_updates` / `recommended_qa_promotions` / `recommended_qa_retirements`

When `--report` is passed, writes `reports/workspace/generalization-report.md`
+ `.json`.

## How to read it

A high `docs_truth_failure_rate` across an archetype means the executor is
consistently overclaiming in README for that stack — tighten `docs_score`
weight or add docs:truth as a required gate.

`weakest_archetypes` is the priority list for the next sprint: which
stacks does the loop most often leave at `raw_demo`?

## Limitations (v0.0.5)

- `regression_rate_by_archetype` and `verification_success_rate_by_archetype`
  are placeholders that require richer per-iteration history than the
  current `AnonymizedCorpusReport` carries. Future Phase 6 will widen the
  data model.
