# Cross-project learning

`corpus/` is the local, redacted index of projects Demo2Project has seen.
Adding a project:

```bash
pnpm demo2project corpus:add --project /path
pnpm demo2project corpus:evaluate --all
pnpm demo2project learn:workspace
pnpm demo2project generalize --all --report
```

Learning pipeline:

1. Per-project events → QA cases (repo scope).
2. Cross-project patterns → `corpus/learning/patterns.json`.
3. Workspace promotion candidates → `corpus/learning/governance/candidates.json`.
4. Approval → `learning:approve` → applied to workspace QA store.

## Privacy

- Paths are hashed.
- `redaction.ts` runs over every persisted artifact.
- Email/path/IP/DB URL patterns are stripped.
- Strict private mode further reduces records.
