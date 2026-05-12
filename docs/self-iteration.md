# Self-iteration

Demo2Project must be able to iterate on **itself**. The minimum machinery for
that lives in MVP:

- `pnpm demo2project self-check` runs the analyze → gap → regression pipeline
  against the repo root.
- The same `ProjectStandard` is applied — no special-casing.
- The QA case store, the regression spec, and the event store all use
  generic paths under `<project>/.demo2project/`, so pointing them at the
  system repo just works.

## Why the same loop applies

The system has no privileged dependency on the project under test. Snapshot,
score, gap, plan, execute, verify, review, learn, regress — every step takes
a `project_path` and produces serializable outputs. The Supervisor calling
itself differs only in `projectPath` and a slightly stricter safety budget.

## Phased self-iteration plan

| Phase | What the system does to itself |
|-------|--------------------------------|
| 1 (MVP) | Read-only: self-check, score, gap, regression. No self-mutation. |
| 2 | Run `iterate` with `MockAgentProvider` on its own example projects — used as a smoke gate. |
| 3 | Generate planning artifacts (`IterationPlan` JSON) for self-improvement, hand them to a human reviewer. |
| 4 | Auto-apply low-risk improvements (docs, README, .env.example, .gitignore) inside a worktree. |
| 5 | Run its own test suite + regression suite after each self-edit; revert on failure. |
| 6 | Cross-project benchmark suite — measure score delta on a curated bad-demo bench. |

## Safety constraints for self-mutation (Phase 4+)

- All edits happen in a git worktree, never on `main` directly.
- Forbidden categories: changes to `src/core/safety.ts`,
  `src/core/redaction.ts`, the regression spec list of assertions, or any
  file under `qa/`. Those require human review.
- `runCommand` enforces timeouts and the dangerous-pattern blocklist for
  every command the Executor issues — including on self-runs.
- Two consecutive iterations with no score gain triggers automatic stop.

## Inputs to make self-iteration credible

The system needs, in order:

1. A real `ClaudeCodeProvider` (or equivalent) — Phase 2.
2. A trustworthy diff-aware reviewer — Phase 3.
3. A curated benchmark set (`benchmarks/` with N bad demos) — Phase 6.

Until those exist, self-iteration is restricted to non-destructive
analysis. That is enough to demonstrate the *control loop* is sound.
