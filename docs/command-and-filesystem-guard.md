# Command and filesystem guard

Three layered guards in [`src/security/guards/`](../src/security/guards/):

## CommandGuard

Wraps `safety.ts` and adds:

- `chmod 777`, `chown -R`, `su`, `nc`, `ssh`, `scp`
- `rm .git`, `dd if=…of=/dev/sd*`
- redirect to `/etc`, `~/.ssh`, `~/.aws`
- download-then-execute combos (`curl -o /tmp/x; bash /tmp/x`)
- `env | curl|wget|nc`, `cat .env | …`

## FileAccessGuard

- Read of secret-class files blocked (`.env`, `id_rsa`, `credentials.json`, `.ssh/`, `.aws/`, `.gnupg/`)
- Writes outside `project_path` blocked
- Writes to high-risk Demo2Project paths require approval
- Deletes always require approval

## NetworkGuard

Policy-level gate (MVP). Allowlist: npm registry, pypi, github.com (via approval). Untrusted repos: denied.

```bash
pnpm demo2project guard:check-command --command "pnpm test"
pnpm demo2project guard:check-file --project ./p --path src/x.ts --mode write
pnpm demo2project guard:report
```

`GuardedCommandRunner` and `GuardedFileSystem` route through these guards
and write audit log entries.
