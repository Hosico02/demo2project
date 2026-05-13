# Trust report

A single document that answers: **is Demo2Project currently safe to run?**

It aggregates:

- threat model residual score
- security policy version + rule count
- autonomy level
- active capability tokens
- open policy violations
- open incidents + approval queue size
- audit log integrity (hash chain ok?)
- secret findings + supply chain risks (if `--project` given)
- prompt injection findings
- plugin / MCP / hook risks
- QA memory health
- privacy mode + retention policy
- emergency stop status

## CLI

```bash
pnpm demo2project trust:report
pnpm demo2project trust:report --project ./path
pnpm demo2project trust:explain --project ./path
```

Reports are written to `reports/trust/trust-report.{json,md}` (redacted).

## Score

Starts from threat-model `trust_readiness_score` (0–100). Subtractions:

- −5 per high/critical policy violation (cap −20)
- −25 if audit chain broken
- −5 if emergency stop active
- −3 per high-risk secret (cap −15)
- −3 per high-risk integration (cap −10)
