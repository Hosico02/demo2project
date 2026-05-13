# Project score

See `src/core/projectScorer.ts` for the implementation. Phase 4 added
**evidence-weighted scoring** so an empty test file or an `echo build` step
does not earn points it didn't earn.

## Anti-gaming detectors

`src/core/antiGamingScorer.ts` runs 8 checks:

1. empty test files
2. sham assertions
3. echo build steps
4. fake CI yaml
5. secrets in source
6. dependency bloat (suspect deps without justification)
7. shadow scripts (scripts that don't match their name)
8. dist-only fakes (build output without source)

Detected gaming caps the relevant dimension or penalises the total.

## How a score moves

A clean iteration with real artifacts typically lifts the score 5–20 points.
Score drops trigger rollback by default (`rollback_on_score_drop=true`).
