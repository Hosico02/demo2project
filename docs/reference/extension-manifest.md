# Extension manifest

Each extension lives in a directory containing `demo2project.extension.json` and an `entry` file.

```jsonc
{
  "name": "my-policy-rule",
  "version": "0.1.0",
  "author": "acme",
  "type": "policy_rule",
  "entry": "index.js",
  "permissions_required": ["read_project_files"],
  "supported_demo2project_versions": ["0.0.8"],
  "description": "Adds a custom policy rule that denies writes to data/ in untrusted repos.",
  "risk_level": "low",
  "config_schema": {},
  "capabilities": ["add_policy_rule"]
}
```

## Lifecycle

1. `extensions:validate --path <dir>` — schema check
2. `extensions:security-review --path <dir>` — static review of permissions and entry code
3. `extensions:install --path <dir>` — adds to registry; high-risk requires `--approval <id>`
4. `extensions:disable --name <name>` — turn off without removing
5. `extensions:list` — registry view

## Constraints

- Extensions **cannot** bypass `SecurityPolicyEngine`.
- High-risk extensions require an approval token.
- Loader never crashes the CLI on broken extensions.
- Capabilities are granted via `CapabilityManager`, not ambient.
