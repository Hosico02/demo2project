# Set up GitHub Actions

```bash
pnpm demo2project github:install-workflows --project $PROJECT --dry-run
pnpm demo2project github:install-workflows --project $PROJECT  # actually write
pnpm demo2project github:workflows-status --project $PROJECT
pnpm demo2project ci:explain
```

## What gets installed

| Workflow | Trigger | What it does |
|---|---|---|
| `demo2project-preflight.yml` | PR | read-only analyze/gap/qa-preflight; skips fork PRs |
| `demo2project-regression.yml` | push to main | QA regression spec |
| `demo2project-trust-report.yml` | weekly + dispatch | trust report + audit verify; uploads artifact |
| `demo2project-benchmark.yml` | dispatch | benchmark suite |
| `demo2project-self-check.yml` | push, PR, dispatch | build + test + self-check |

## Safety

- All workflows use `permissions: contents: read` by default.
- Preflight skips fork PRs (`if: github.event.pull_request.head.repo.full_name == github.repository`).
- No workflow writes back to your branches by default.
- Trust report uploads an artifact; remove that step if your org disallows artifacts.
