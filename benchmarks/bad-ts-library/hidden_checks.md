# bad-ts-library — hidden checks

- `main` points at `src/index.ts` directly instead of a compiled artifact.
- `greet`'s parameter is typed `any`, which a real publishable lib would forbid.
- No `CHANGELOG.md`, no `LICENSE`.
