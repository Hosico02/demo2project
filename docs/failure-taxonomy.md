# Failure taxonomy

Cross-project learning needs stable category join keys. Free-form messages
are useless at corpus scale. v0.0.5 ships a fixed taxonomy of ~35
categories under 8 buckets:

```
verification_failure/*       (5)
process_failure/*            (4)
docs_failure/*               (4)
test_quality_failure/*       (6)
project_structure_failure/*  (5)
safety_failure/*             (4)
executor_failure/*           (4)
scoring_failure/*            (3)
```

## CLI

```bash
demo2project taxonomy:list
demo2project taxonomy:explain --category process_failure/missing_validation_after_code_change
```

## Consumers

- `QACase.category` — should match a taxonomy entry going forward
- `GapFinding.category` — same
- `LearningPattern.pattern_type` — bucket-level (e.g. `docs_truth_failure`)
- evaluation reports — counters/rates per category

## Extending

Adding a category is a breaking-ish change for cross-project joins —
deletions or renames invalidate existing corpus reports. Prefer adding new
leaf categories under existing buckets when possible.
