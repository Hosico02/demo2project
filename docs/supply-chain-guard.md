# Supply chain guard

Checks:

- Loose versions (`*`, `latest`)
- Git / URL / tarball sources
- Typo-squat heuristic against a popular-package list
- Lifecycle scripts (`postinstall`, `preinstall`, `prepare`)
- Critical patterns in package scripts (`curl | sh`, `nc`, `sudo`, `rm -rf`, `base64 -d | sh`, `eval $(curl ...)`)
- Lockfile mass change (`>20%` line delta)

## CLI

```bash
pnpm demo2project supply-chain:scan --project ./path
pnpm demo2project supply-chain:diff --before ./before.lock --after ./after.lock
pnpm demo2project supply-chain:report --project ./path
```

## Policy

- `dependency_install` → `require_approval` by default
- `package_script_execution` with lifecycle hook → `deny` by default
- Untrusted repos: install scripts denied without approval path
