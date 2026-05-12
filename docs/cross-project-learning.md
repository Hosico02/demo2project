# Cross-project learning

Demo2Project's value is the **transferable knowledge** it accumulates from
many projects — not the score it achieves on one. Phase 5 ships the
machinery: corpus, learning engine, governance, similarity, generalization.

## Data flow

```
benchmarks/public/*  ───────┐
benchmarks/hidden/*  ───────┤
real projects (corpus:add) ─┤
                            ▼
              corpus:evaluate
                            │
                            ▼
   corpus/anonymized/<id>.json (PER PROJECT, redacted, no source)
                            │
                            ▼
                  learn:workspace
                            │
                            ▼
        corpus/learning/patterns.json (LearningPattern[])
                            │
                            ▼
                learning:candidates  (PromotionCandidate[])
                            │
                            ▼  (human approval required for global)
        repo → workspace → global scope promotion
                            │
                            ▼
              standards:suggest-updates
                            │
                            ▼
    config/approval-policy.json gates dangerous changes
```

## CLIs

```bash
demo2project corpus:add --project ./real-thing
demo2project corpus:evaluate --all
demo2project learn:workspace
demo2project learn:patterns
demo2project learning:candidates
demo2project learning:approve --candidate <id>
demo2project standards:suggest-updates
demo2project standards:approve-update --id <id>
demo2project generalize --all --report
demo2project report:workspace
```

## Anti-pollution rules (codified)

- `repo → workspace`: ≥ 2 distinct source projects, FP rate ≤ 1/3.
- `workspace → global`: ≥ 3 distinct archetypes OR ≥ 5 distinct projects, manual approval required.
- Safety-failure patterns NEVER auto-promote (high risk).
- Rejected patterns do not re-appear unless new evidence accumulates.

## Why benchmark wins ≠ real generalization

Benchmarks are fixed. Real projects vary along axes — language version,
framework version, monorepo layout, lockfile state, CI vendor. Phase 5
measures whether the system actually transfers across that variance, with
explicit per-archetype success rates and weakness diagnostics.
