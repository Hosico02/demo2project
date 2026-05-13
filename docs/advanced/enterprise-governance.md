# Enterprise governance (advanced)

Pointer to `docs/enterprise-governance.md`. Highlights:

- 6 roles: owner, security_reviewer, engineering_lead, developer, auditor, read_only
- approval risk tiers per role
- dual-approval option for critical actions
- restricted_actions list

## Setup checklist

1. Edit `config/enterprise-governance.json`.
2. Issue capability tokens with `approved_by` set when high-risk.
3. Install GitHub workflows that respect your privacy mode.
4. Set retention policy via `retention:policy --set ...`.
5. Run `pnpm demo2project trust:report` weekly via CI.
