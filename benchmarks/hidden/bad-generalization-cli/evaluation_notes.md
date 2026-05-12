# bad-generalization-cli (hidden)

Used by `eval --include-hidden` to score generalization, not benchmark
overfitting. The fixture's defects are listed in `hidden_defects.json`
(intentionally NOT `known_defects.json`) so they're invisible to planner
and executor — Demo2Project must detect them anyway.

Specifically tests:
- the anti-gaming scorer's `forbidden_pattern_in_source` detector finds
  the AKIA-shaped secret in `src/index.js`
- the docs-truth checker would catch any README lies introduced by the
  agent (the source has no README on purpose)
