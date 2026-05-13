# Claude CLI security hooks

Eight hooks under `templates/claude/hooks/`:

| Hook | When | What it does |
|---|---|---|
| `pre-tool-use-security-policy.mjs` | before each tool | reads `config/security-policy.json` and blocks denied actions |
| `pre-tool-use-command-guard.mjs` | before Bash | extended dangerous-command patterns |
| `pre-tool-use-file-access-guard.mjs` | before Write / Edit | blocks writes to secret-class and high-risk paths |
| `pre-tool-use-secret-protection.mjs` | before each tool | scans tool input for AKIA / ghp_ / sk-* / JWT / PEM |
| `post-tool-use-audit-recorder.mjs` | after each tool | appends redacted entry to `.demo2project/audit/hook-audit.jsonl` |
| `post-tool-use-evidence-recorder.mjs` | after each tool | appends evidence node |
| `stop-verification-and-policy-gate.mjs` | end of turn | flags high-risk writes without approval marker |
| `stop-incident-check.mjs` | end of turn | refuses to continue if emergency stop or critical incident is open |

## Behavior

- Exit code `2` + stderr is treated by Claude as a hard veto.
- Disable everything with `DEMO2PROJECT_HOOKS_DISABLED=1`.

## CLI

```bash
pnpm demo2project claude:install-security-hooks --project ./path
pnpm demo2project claude:uninstall-security-hooks --project ./path
pnpm demo2project claude:hooks-status --project ./path
```

> Hooks are **defense in depth**, not the security boundary. The boundary is
> [`SecurityPolicyEngine`](./security-policy-engine.md) and
> [`AuditLog`](./audit-log.md). Hooks merely apply the same checks one layer
> closer to the executor.
