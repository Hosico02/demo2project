# Audit log

Tamper-evident append-only JSONL at
`<system_root>/.demo2project/audit/audit.log`.

Each event includes:

- `id`, `timestamp`, `actor`, `action`, `target`, `decision`, `risk_level`
- `policy_decision_id`, `approval_id`, `evidence_ids`, `incident_id`
- `previous_hash` (chains the event to the prior one)
- `event_hash` (SHA-256 of the canonical event minus `event_hash`)
- `metadata` (redacted)

## Verifying the chain

`AuditVerifier.verify` walks every event and re-computes hashes. Any silent
edit, reorder, or deletion produces `ok: false` with `broken_at: <index>`.

## CLI

```bash
pnpm demo2project audit:show --limit 20
pnpm demo2project audit:verify
pnpm demo2project audit:report
pnpm demo2project audit:explain --event audit_xxx
```

## What writes to the log

- Every policy `deny` and `require_approval`
- Every capability issue / use / revoke
- Every approval create / approve / reject / revoke
- Every blocked command and file access (via guards)
- Every emergency stop / resume
- Every incident open / resolve
- Privacy mode changes, retention cleanups

## Privacy

Secrets are redacted from the `target` field and metadata before persistence.
