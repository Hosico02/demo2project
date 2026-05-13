# Config reference

Phase 8 introduces a unified config at:

- system-level: `<repo>/config/demo2project.json`
- project-level: `<project>/.demo2project/config.json`

Schema: see `src/product/config/ConfigSchema.ts`. Version field: `schema_version`.

## Sections

```jsonc
{
  "schema_version": "0.0.8",
  "profile": "balanced",
  "autonomy": { "level": "L2_SAFE_PATCH_WITH_VERIFICATION", "max_iterations": 10, "max_cost_usd": 1.0 },
  "security": { "policy_path": "config/security-policy.json", "require_approval_for_self_modification": true, "network_default": "deny" },
  "privacy": { "mode": "normal" },
  "retention": { "keep_audit_log_days": 180, "keep_sessions_days": 30, "keep_replay_bundles_days": 14 },
  "qa": { "workspace_memory_enabled": true, "global_memory_requires_approval": true },
  "reports": { "default_format": "markdown", "redact_by_default": true },
  "integrations": { "claude_hooks_installed": false, "claude_security_hooks_installed": false, "github_workflows_installed": false },
  "extensions": { "enabled": false, "allowlist": [] }
}
```

## Profiles

`conservative` → L0, deny network, private mode. `balanced` → L2, default network deny. `autonomous` → L5, allowlist network, still requires approval for high-risk.

## Migration

`pnpm demo2project config:migrate` re-shapes pre-0.0.8 configs into the unified schema.
`pnpm demo2project config:diff --from a.json --to b.json` flags downgrades.

## Other policy files

Phase 7 policy files (`security-policy.json`, `autonomy-policy.json`, etc.)
still live in `config/`. The unified config references them by path.
