# bad-docs-project — evaluation notes

This case is the docs-truth gauntlet. The starting README claims many
commands; only `pnpm start` is real. The naive baseline overwrites the
README with even more lies; Demo2Project's `DocsTruthChecker` keeps
catching them, and the rule-based executor adds matching scripts.
Demo2Project should end with significantly fewer `docs_false_claims`
than the baseline.
