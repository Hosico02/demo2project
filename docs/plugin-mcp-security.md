# Plugin / MCP / Hook security

Claude CLI integrations can expand executor capabilities beyond Demo2Project's
control. Phase 7 scans and reviews them but **does not auto-install** anything.

## Scanners

- `PluginSecurityScanner` — plugin manifests (`plugin.json`), trust source list, presence of hooks / MCP / commands.
- `McpSecurityScanner` — `mcp.json` entries; flags fs / network requests.
- `HookSecurityScanner` — walks shell / TS / JS hooks; flags shell exec, secret references, policy mutations, network upload patterns.

## Trust source list

`anthropic/*` is trusted. Everything else is untrusted by default.

## CLI

```bash
pnpm demo2project plugin:scan
pnpm demo2project mcp:scan
pnpm demo2project hooks:scan
pnpm demo2project integration:security-report
```

> Plugins, MCP servers, and hooks are NOT security boundaries. They expand
> attack surface; they do not enforce policy. Treat them as untrusted code
> with delegated privilege.
