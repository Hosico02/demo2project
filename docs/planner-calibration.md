# Planner calibration

The Planner predicts `expected_score_delta` and `risk_level` for each task.
`PlannerCalibrationEngine` records predicted vs actual so future Planner
versions can self-correct.

## CLI

```bash
demo2project planner:calibrate --project ./path
demo2project planner:report --project ./path
demo2project planner:explain --project ./path --task-category docs/readme
```

Task categories (derived from task title): `docs/readme`, `test/setup`,
`build/config`, `config/env`, `ci/workflow`, `repo/gitignore`,
`runtime/docker`, `other`.

Output `calibrationReport` includes `mean_prediction_error` and
`mean_risk_error` per category, plus `worst_predictions[5]` for review.

Storage: `<project>/.demo2project/planner/calibration.json`.
