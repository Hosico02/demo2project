# Replay system

Every autonomy session can be packaged into a self-contained `ReplayBundle`
for reproducibility and audit.

## What goes into a bundle

- the session JSON
- redacted copies of event logs (per iteration JSONL)
- redacted copies of iteration summaries
- redacted copies of evidence graphs
- the QA case store at the time
- the git commit ref if available

**Source code is NOT bundled.** Replay reproduces the *decisions*, not the
codebase. Pair the bundle with the git ref to inspect code.

## CLI

```bash
demo2project replay:create  --project ./path --session <session_id>
demo2project replay:run     --project ./path --bundle <bundle_id>
demo2project replay:explain --project ./path [--bundle <bundle_id>]
```

Bundles live at `.demo2project/replay/<bundle_id>/`. Everything is run
through `redact()` before write — secrets / emails / paths / IPs / DB URLs.
