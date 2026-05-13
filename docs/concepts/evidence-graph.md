# Evidence graph

Phase 4 added `src/core/evidenceGraph.ts`. Each iteration writes
`.demo2project/evidence/<iter>.json` with claim nodes ("project starts at
score=X", "iteration delta=Y") and evidence nodes (verification command
output, file diffs, audit references).

Phase 7 wraps the audit chain around persistence so evidence cannot be
silently edited; `audit:verify` will fail if it is.

## Reading

```bash
pnpm demo2project evidence:show --project <path> --iter <id>
pnpm demo2project evidence:explain --project <path> --iter <id>
```
