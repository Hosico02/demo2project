# Incident response

When Demo2Project detects a high-severity event it creates an `Incident`,
classifies severity, and may trigger the emergency stop.

## Incident types

`secret_exposure`, `unsafe_command_attempt`, `prompt_injection_detected`,
`malicious_repo_detected`, `policy_violation`, `approval_bypass_attempt`,
`audit_log_tampering`, `self_modification_violation`,
`network_exfiltration_attempt`, `supply_chain_risk`, `qa_memory_poisoning`,
`rollback_failure`.

## Auto emergency stop

`IncidentClassifier.shouldTriggerEmergencyStop` returns true for any
`critical` incident and for `high` incidents of:

- `unsafe_command_attempt`
- `audit_log_tampering`
- `self_modification_violation`

When the emergency stop is active, all `Stop` hooks in `templates/claude/hooks/`
veto further tool execution.

## CLI

```bash
pnpm demo2project incident:list
pnpm demo2project incident:show --id inc_xxx
pnpm demo2project incident:resolve --id inc_xxx --reason "rotated key + audit clean"
pnpm demo2project emergency:status
pnpm demo2project emergency:stop --reason "investigating supply chain"
pnpm demo2project emergency:resume --reason "investigation closed"
```

Reports are written to `.demo2project/governance/incidents/<id>.{json,md}` (redacted).
