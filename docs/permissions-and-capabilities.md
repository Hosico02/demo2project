# Permissions and capabilities

Executors do not have ambient authority. They request a `CapabilityToken`
([`src/security/capabilities/CapabilityToken.ts`](../src/security/capabilities/CapabilityToken.ts))
with explicit capabilities, scope, expiry, and max uses.

## Capability list (17)

`read_project_files`, `write_project_files`, `delete_project_files`,
`run_safe_commands`, `run_package_scripts`, `install_dependencies`,
`access_network`, `update_qa_memory`, `update_workspace_memory`,
`update_global_memory`, `update_project_standards`, `modify_security_policy`,
`modify_verification_gate`, `modify_hooks`, `self_iterate`, `export_reports`,
`create_replay_bundle`.

## High-risk capabilities

Issuance of high-risk capabilities requires `approved_by` to be set. They
cannot be granted automatically by self-iteration:

`delete_project_files`, `install_dependencies`, `access_network`,
`update_global_memory`, `modify_security_policy`,
`modify_verification_gate`, `modify_hooks`, `self_iterate`.

## CLI

```bash
pnpm demo2project permissions:list
pnpm demo2project permissions:explain --capability self_iterate
pnpm demo2project permissions:issue --actor executor --capability run_safe_commands --reason "iterate-task-7"
pnpm demo2project permissions:revoke --token tok_xxx --reason "scope changed"
pnpm demo2project permissions:audit
```

Every issue/use/revoke writes to the audit log.
