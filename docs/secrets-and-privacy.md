# Secrets and privacy

## Secret scanning

[`SecretScanner`](../src/security/secrets/SecretScanner.ts) covers AWS / GitHub /
Anthropic / OpenAI keys, JWTs, DB URLs, env values, password keys, webhook
secrets, OAuth secrets, PEM blocks, email, paths, IPs, private repo URLs.

```bash
pnpm demo2project secrets:scan --project ./path
pnpm demo2project secrets:scan-log --file ./log.txt
pnpm demo2project secrets:report --project ./path
```

## Redaction

[`redaction.ts`](../src/core/redaction.ts) is applied on every persisted write.
`SecretRedactor` exposes string/object/summary helpers. Replay bundles, audit
log, reports — all redact before disk write.

## Privacy modes

| Mode | Behavior |
|---|---|
| `normal` | summary + redacted evidence |
| `private` | no raw stdout, no abs paths, no repo identifiers |
| `strict_private` | no source snippets, no command output, no user paths |
| `enterprise_restricted` | per-policy data retention / export gating |

```bash
pnpm demo2project privacy:mode
pnpm demo2project privacy:set-mode --mode strict_private
pnpm demo2project privacy:inventory
pnpm demo2project privacy:delete --project ./p --session sess_xxx
pnpm demo2project retention:policy --set --audit-days 90
pnpm demo2project retention:cleanup
```
