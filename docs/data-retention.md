# Data retention

Defaults (in `src/privacy/DataRetentionPolicy.ts`):

| Bucket | Days |
|---|---|
| sessions | 30 |
| audit log | 180 |
| replay bundles | 14 |
| qa cases | 90 |

## CLI

```bash
pnpm demo2project retention:policy
pnpm demo2project retention:policy --set --audit-days 90 --session-days 14 --replay-days 7
pnpm demo2project retention:cleanup
pnpm demo2project privacy:inventory --project ./path
pnpm demo2project privacy:delete --project ./path --session sess_xxx
```

Deletion records are written to the audit log.
