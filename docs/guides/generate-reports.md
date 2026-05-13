# Generate reports

```bash
pnpm demo2project report:project --project $PROJECT
pnpm demo2project report:security --project $PROJECT
pnpm demo2project report:trust   --project $PROJECT
pnpm demo2project report:workspace
pnpm demo2project report:index
```

Each writes `reports/<type>/report.{md,json}`. To render to HTML:

```bash
pnpm demo2project report:html --report reports/project-report/report.json
```

Reports are **redacted by default**. To disable redaction, set
`config.reports.redact_by_default = false` (downgrade — warned by `config:diff`).
