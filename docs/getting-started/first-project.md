# Your first real project

```bash
PROJECT=/path/to/your/repo

# 1. Setup wizard (interactive, recommended)
pnpm demo2project init --project $PROJECT --interactive

# 2. Sanity check
pnpm demo2project doctor --project $PROJECT

# 3. Read-only scan
pnpm demo2project analyze --project $PROJECT
pnpm demo2project gap --project $PROJECT
pnpm demo2project trust:check --project $PROJECT
pnpm demo2project secrets:scan --project $PROJECT

# 4. Recipe recommendation
pnpm demo2project recipes:recommend --project $PROJECT

# 5. One iteration (writes; rule-based, safe)
pnpm demo2project iterate --project $PROJECT --provider rule-based --max-iterations 1

# 6. Trust report
pnpm demo2project trust:report --project $PROJECT
```

## If something goes wrong

```bash
pnpm demo2project diagnose
pnpm demo2project troubleshoot
pnpm demo2project logs:explain --file <some-log>
```

Every error has a stable `D2P_*` code with documented causes and remediations.

## Profiles

- `conservative` — read-only first; no automatic code modifications.
- `balanced` — safe patches with verification (default).
- `autonomous` — long-run sessions; high-risk actions still require approval.

Switch profile any time: `pnpm demo2project init --project $PROJECT --profile autonomous`.
