# Gap analysis

`pnpm demo2project gap --project <path>` produces a `GapReport`:

- `findings[]` — actionable items with severity, why_it_matters, suggested_fix.
- `blockers[]` — must-fix to even reach `working_demo`.
- `recommendations[]` — strategic suggestions (e.g., "adopt QA discipline").

## Categories

- missing recommended file
- missing test command
- missing CI
- missing env example
- structure mismatch with project archetype
- suspicious script pattern
- empty test file detected
- docs truth mismatch

Each finding carries a stable `id` so QA cases and iterations can reference it.
