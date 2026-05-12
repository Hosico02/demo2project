# Hidden benchmark

Generalization signal vs the overfit risk that comes with a single visible benchmark set.

## Layout

```
benchmarks/
  public/         # planner & executor see these; covered by eval
  hidden/         # invisible by default; only --include-hidden surfaces them
```

Hidden cases use `hidden_defects.json` (NOT `known_defects.json`) so the agent and Planner cannot use the defect list to "study to the test". The EvaluationRunner only reads `hidden_defects.json` AFTER both A and B paths have finished, to score generalization.

## Usage

```bash
demo2project eval --all                       # public only
demo2project eval --case bad-generalization-cli  # finds nothing — hidden gated
demo2project eval --case bad-generalization-cli --include-hidden
demo2project benchmark --include-hidden
```

## What's in v0.0.4 hidden set

- `bad-generalization-cli` — contains a hardcoded `AKIA…` secret. The anti-gaming scorer's `forbidden_pattern_in_source` detector should catch it without ever being told.
