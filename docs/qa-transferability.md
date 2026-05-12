# QA transferability

QA cases without transferability metadata default to "apply if `project_type`
is `generic` or matches the current archetype" — the legacy behavior.

Phase-5 adds an explicit `transferability` block on every case:

```jsonc
{
  "transferability": {
    "scope": "workspace",
    "portability_score": 0.7,
    "applicable_archetypes": ["node-cli", "typescript-library"],
    "excluded_archetypes": ["docs-only-project"],
    "required_project_signals": ["dep:typescript"],
    "excluded_project_signals": ["dep:next"],
    "minimum_confidence": "medium",
    "examples_where_triggered": [],
    "examples_where_prevented_failure": [],
    "false_positive_contexts": []
  }
}
```

## Evaluator rules (in order)

1. Retired / noisy lifecycles never apply.
2. FP_count > TP_count + 1 → not applicable.
3. Legacy cases (no `transferability`): match by `project_type` only.
4. Hard excludes win over everything else.
5. All `required_project_signals` must match.
6. `applicable_archetypes` filter (empty = "any non-excluded").
7. Rank = `portability_score` + lifecycle / usefulness boost.

## CLI

```bash
demo2project qa:transfer --project ./path --case <id|fingerprint>
demo2project qa:applicable --project ./path
```

`qa:applicable` lists every persisted case + per-case decision + reason —
useful for explaining what preflight will surface.
