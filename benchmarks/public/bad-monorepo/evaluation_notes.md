# bad-monorepo — evaluation notes

This case exists to surface monorepo blind spots. v0.0.3 RuleBasedExecutor
treats the root only; per-package improvements are deferred. Useful for
measuring whether docs_truth and standard selection still behave when
`workspaces` is present.
