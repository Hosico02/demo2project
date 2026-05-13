# Approval workflow

Risk-tiered approvals for any action where the policy decision is
`require_approval`.

## Roles and risk

| Role | Approves up to |
|---|---|
| owner | critical |
| security_reviewer | high |
| engineering_lead | medium |
| developer | low |
| auditor | (cannot approve) |
| read_only | (cannot approve) |

## Approval fields

`id`, `action`, `actor`, `requested_capabilities`, `risk_level`, `reason`,
`evidence_ids`, `affected_files`, `policy_decision_id`, `scope`, `max_uses`,
`expires_at`, status, `approved_by` / `rejected_by`, `decision_reason`.

## CLI

```bash
pnpm demo2project approval:list
pnpm demo2project approval:show --id apr_xxx
pnpm demo2project approval:approve --id apr_xxx --role security_reviewer --reason "verified"
pnpm demo2project approval:reject --id apr_xxx --role owner --reason "policy violation"
pnpm demo2project approval:revoke --id apr_xxx --reason "context changed"
```

All decisions write to the audit log.
