# bad-ts-library — evaluation notes

A TS library missing tsconfig, scripts, and tests. RuleBasedExecutor's
tsconfig handler fires here, and the test handler wires `node --test`.
The baseline path leaves the README overclaiming about an `npm test`
that has no real runner attached.
