# Troubleshooting

```bash
pnpm demo2project doctor
pnpm demo2project troubleshoot          # list known error codes
pnpm demo2project diagnose --error D2P_VERIFICATION_MISSING
pnpm demo2project remediation --error D2P_AUDIT_CHAIN_BROKEN
pnpm demo2project logs:explain --file <some-log-file>
```

## Stable error codes

Every important error has a `D2P_*` code. See `src/product/diagnostics/ErrorCatalog.ts` for the full list. A few common ones:

- `D2P_CONFIG_MISSING` — run `init`
- `D2P_VERIFICATION_MISSING` — executor changed files without verifying; gate downgraded
- `D2P_UNTRUSTED_REPO_BLOCKED` — repo failed trust scan; run `trust:check` or quarantine
- `D2P_SECRET_DETECTED` — rotate and remove from history
- `D2P_AUDIT_CHAIN_BROKEN` — open an incident, preserve log
- `D2P_PROVIDER_PARSE_FAILED` — model output unparseable; tighten prompt or use rule-based

## When the loop seems stuck

```bash
pnpm demo2project trend:show --project $PROJECT
pnpm demo2project drift:check --project $PROJECT
pnpm demo2project handoff:create --project $PROJECT --session <sid>
```

## When the loop blew up

```bash
pnpm demo2project emergency:status
pnpm demo2project incident:list
pnpm demo2project regression:bisect --project $PROJECT
pnpm demo2project rollback:stable --project $PROJECT --session <sid>
```
