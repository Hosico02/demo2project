# QA learning

`src/qa/` holds the QA subsystem. A `QACase` is a stable record of a known
failure mode (e.g., "executor changed files without running verification").

Lifecycle: `new → active → confirmed → noisy → retired`.

Three memory scopes:

- repo (`.demo2project/qa-cases.json`)
- workspace (`corpus/learning/patterns.json`)
- global (`qa/specs/global-patterns.json`)

Promotions move from repo → workspace → global. Promotions require approval
(Phase 5+) and go through `learning:approve` / `learning:reject`.

## Why it matters

Without QA learning, every session starts from zero. With it, repeated
failures accumulate into assertions that future iterations check against.
