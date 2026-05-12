# Regression bisector

`RegressionBisector` walks the iteration history chronologically and
identifies the first iteration where score dropped AND/OR a verification
command failed.

## CLI

```bash
demo2project regression:bisect --project ./path
demo2project regression:explain --project ./path --regression <id>
demo2project rollback:stable --project ./path --session <session_id>
```

Output:

```jsonc
{
  "id": "reg_xxx",
  "first_detected_iteration": "iter_b",
  "suspected_introducing_iteration": "iter_b",
  "affected_files": ["app.js"],
  "failed_commands": ["pnpm test"],
  "severity": "high",
  "root_cause_hypothesis": "score dropped from 50 to 30 after touching 1 file(s); 1 verification failure(s)",
  "rollback_recommendation": "rollback_to_previous_iteration"
}
```

`rollback:stable` returns the iteration_id to revert to. The mechanical
git revert lives in `IterationWorkspace.rollback` (Phase 2).
