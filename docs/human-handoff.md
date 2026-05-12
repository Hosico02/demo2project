# Human handoff

When the autonomy controller stops, requests approval, or otherwise can't
make safe forward progress, it should hand the human a structured summary
instead of a wall of logs.

## CLI

```bash
demo2project handoff:create --project ./path --session <session_id> [--reason "<text>"]
demo2project handoff:show   --project ./path [--session <id>] [--id <handoff_id>]
```

## What's in the report

- `reason_for_handoff`
- `current_state` (session.status at the time)
- `unresolved_blockers` (pending approvals, noisy QA, etc.)
- `failed_attempts` (regression bisector findings)
- `suspected_root_causes`
- `recommended_human_actions`
- `safe_next_steps` (e.g. "lower autonomy_level to L2")
- `files_to_review` (from bisector)
- `commands_to_run` (e.g. `pnpm test`, `pnpm build`)
- `risk_level`

Outputs both JSON and Markdown to `.demo2project/handoff/<id>.{json,md}`.

## Design principle

Demo2Project doesn't pretend every problem auto-solves. The handoff
report is a **first-class output** — a sign of system maturity, not
failure.
