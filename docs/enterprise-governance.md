# Enterprise governance

`config/enterprise-governance.json` configures team-level policy.

```json
{
  "team_name": "acme-platform",
  "current_actor": "alice",
  "current_role": "security_reviewer",
  "members": [
    { "actor": "alice", "role": "security_reviewer" },
    { "actor": "bob", "role": "engineering_lead" }
  ],
  "enforce_dual_approval_for_critical": true,
  "data_export_requires_approval": true,
  "privacy_mode_required": "private",
  "restricted_actions": ["self_iteration"]
}
```

## Roles (6)

`owner`, `security_reviewer`, `engineering_lead`, `developer`, `auditor`, `read_only`.

- `owner` can do anything.
- `security_reviewer` approves up to `high`; can view audit and reports; can modify security policy with approval.
- `engineering_lead` approves up to `medium`; can run iterate / autonomy.
- `developer` approves only `low`; can run iterate.
- `auditor` is read-only over reports and audit log.
- `read_only` sees reports only.

## CLI

```bash
pnpm demo2project governance:roles
pnpm demo2project governance:whoami
pnpm demo2project governance:can --action run_iterate
pnpm demo2project governance:report
```
