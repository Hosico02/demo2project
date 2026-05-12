# bad-next-app — evaluation notes

This case exists to test that the Analyzer auto-selects the `nextjs-app`
standard given a `next` dep, and that RuleBasedExecutor's basic handlers
move the score even without bundler-specific transforms.

The baseline path is expected to produce an overclaiming README. The
demo2project path is expected to keep `docs_truth_missing` low because
the rule-based executor writes a README that matches the scripts it
actually adds.
