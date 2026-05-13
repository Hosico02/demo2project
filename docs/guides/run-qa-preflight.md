# Run QA preflight

QA preflight loads the QA case store for a project and prints the active count.

```bash
pnpm demo2project qa:preflight --project $PROJECT
pnpm demo2project qa:audit --project $PROJECT
pnpm demo2project qa:health --project $PROJECT
```

If `qa:health` flags high noise, compact:

```bash
pnpm demo2project qa:compact --project $PROJECT --apply
```

Compaction is conservative — it merges duplicates and retires stale entries
but never deletes confirmed cases without approval.
