# Learning governance

Promotion of QA cases or standard rules from repo→workspace→global is the
single most dangerous operation in cross-project learning. Wrong-direction
promotion poisons every future project.

## Rules

| Promotion | Required evidence |
|---|---|
| repo → workspace | ≥ 2 distinct projects, FP rate ≤ 1/3, not in safety category |
| workspace → global | ≥ 3 distinct archetypes OR ≥ 5 distinct projects, **manual approval**, clear applicable/excluded conditions |

`safety_failure/*` patterns NEVER auto-promote.

## CLI

```bash
demo2project learning:candidates
demo2project learning:explain --candidate <id>
demo2project learning:approve --candidate <id> [--note <s>]
demo2project learning:reject --candidate <id> [--note <s>]
```

## Decision audit trail

Every approve/reject writes back to `corpus/learning/governance/candidates.json`
with `decided_at` + `approver` (defaults to `$USER`). Rejected candidates
don't reappear unless the underlying `LearningPattern` accumulates new
evidence (new `support_count`).
