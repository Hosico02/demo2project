# Security policy engine

Policy lives in [`config/security-policy.json`](../config/security-policy.json) (or its bundled default
[`src/security/policy/default-security-policy.json`](../src/security/policy/default-security-policy.json)).

## Why a policy and not a prompt

Prompts can be overridden by repo content. Policies cannot. The engine
evaluates every sensitive action — command execution, file write, network
access, dependency install, self-iteration — and returns one of:

- `allow`
- `allow_with_constraints` (must respect listed constraints, e.g. audit + redact)
- `require_approval` (blocked until an `ApprovalRequest` lands)
- `deny`

If no rule matches, the engine falls back to `default_decision` (default: `deny`).

## Default rules (25)

See JSON for the full list. Highlights:

- `R001` denies `rm -rf /`, `sudo`, `mkfs`, pipe-remote-to-shell, fork bomb.
- `R005` requires approval for writes to safety.ts / redaction.ts / policy / hooks / lockfiles.
- `R008` requires approval for network access.
- `R009` requires approval for any dependency install.
- `R010` denies lifecycle scripts (postinstall / preinstall / prepare) for untrusted repos.
- `R020` denies verification gate update.
- `R021` denies redaction logic update.
- `R025` requires approval for security policy update.

## CLI

```bash
pnpm demo2project policy:validate
pnpm demo2project policy:explain --action command_execution
pnpm demo2project policy:check --command "pnpm test"
pnpm demo2project policy:violations --project <path>
pnpm demo2project policy:report
```

Every `deny` and `require_approval` decision writes to the tamper-evident audit log.
