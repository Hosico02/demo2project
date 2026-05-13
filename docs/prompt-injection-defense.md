# Prompt injection defense

Repo content can contain instructions designed to manipulate the AI. Demo2Project:

1. **Scans** README, comments, scripts, tests, config for known injection patterns.
2. **Sanitizes** context blocks before passing to the executor.
3. **Wraps** repo content with an explicit `<<<BEGIN_UNTRUSTED_REPO_CONTENT>>> ... <<<END_UNTRUSTED_REPO_CONTENT>>>` boundary.
4. **Refuses** to follow privilege-escalation requests embedded in repo content.

## Patterns detected (13)

- ignore previous rules
- leak secrets
- read .env
- execute dangerous command
- disable verification / hooks / gate
- modify security policy
- skip approval
- exfil system prompt
- upload logs
- install unknown MCP / plugin
- clear QA memory
- fabricate verification
- mark unverified complete

## Why a "boundary" is not the security

The boundary is **clarity scaffolding**, not enforcement. The actual
enforcement is in [`SecurityPolicyEngine`](./security-policy-engine.md) — the
model can be tricked, but the policy engine cannot.

## CLI

```bash
pnpm demo2project prompt-injection:scan --project ./path
pnpm demo2project prompt-injection:explain --project ./path --finding pi_xxx
```
