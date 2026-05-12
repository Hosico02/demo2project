# Evidence graph

Every system conclusion is backed by an evidence chain.

## Two node types

- **`EvidenceNode`** — a single observation. Types: `command` / `file` / `diff` / `test` / `qa_case` / `review` / `score` / `docs_claim` / `finding` / `note`. Each carries `source_agent`, `confidence` (high/medium/low), and optional `raw_ref` pointer.
- **`ClaimNode`** — an assertion. Cites `evidence_ids: string[]`, has a `status` (`verified` / `unverified` / `contradicted` / `stale`).

## Persistence

`<project>/.demo2project/evidence/<iteration_id>.json`

One file per iteration. Append-only inside the iteration. Never mutated in place — claims contradicted later get `invalidated_at` stamped.

## CLI

```bash
demo2project evidence:show --project <path> [--iteration <id>]
demo2project evidence:explain --project <path> --iteration <id> --claim <claim_id>
```

`evidence:show` defaults to the latest iteration if no `--iteration` is passed.

## How it's wired

The Supervisor adds nodes at well-defined points each iteration:

- snapshot evidence (analyzer, high confidence)
- score-before claim (cites snapshot + score evidence)
- finding evidence (one per gap finding)
- score-after evidence + delta claim (verified if score didn't regress, contradicted if it did)
- qa-case evidence (one per persisted case)

The graph is intentionally read-only after `persist()`. To re-derive views, load with `EvidenceGraph.load()` and project as needed.
