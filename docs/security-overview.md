# Security overview (Phase 7)

Demo2Project is a **control layer for AI software engineering**. Phase 7 turns
that control layer into something a real team or enterprise can trust to run
unattended against unknown repositories.

This document is the top of a tree. Each subtopic links to its own doc.

## Principles

1. **Default minimum permission.** Executors get no capability they did not request and were not granted.
2. **Default distrust of unknown repos.** Unfamiliar repositories are partially_trusted at best; install scripts, network, and high-risk commands are denied.
3. **Default distrust of natural-language claims.** Executors must produce verification evidence; their words alone never close a task.
4. **No high-risk self-modification without approval.** `forbidden_self_modifications` is the gate; every change to safety / redaction / policy / hooks goes through approval.
5. **No secret leakage.** `redact()` is applied on every persisted write — events, evidence graph, replay bundles, audit log, reports.
6. **Policy is the boundary, not the prompt.** Prompts in repo content cannot override policies, hooks, or the verification gate.

## Layers

| Layer | Where | What it enforces |
|---|---|---|
| `safety.ts` | `src/core/safety.ts` | Baseline shell command blacklist (Phase 1). |
| `CommandGuard` | `src/security/guards/CommandGuard.ts` | Extended pattern set on top of safety.ts. |
| `FileAccessGuard` | `src/security/guards/FileAccessGuard.ts` | Path-based read/write/delete check (boundary + secret-class). |
| `NetworkGuard` | `src/security/guards/NetworkGuard.ts` | Allowlist + untrusted-repo denial + intent log. |
| `SecurityPolicyEngine` | `src/security/policy/SecurityPolicyEngine.ts` | Policy-as-code: deny / allow / require_approval per action. |
| `CapabilityManager` | `src/security/capabilities/CapabilityManager.ts` | Time- and use-bounded capability tokens. |
| `ApprovalWorkflow` | `src/governance/approval/ApprovalWorkflow.ts` | Risk-tiered approval with role-based gating. |
| `AuditLog` (hash chain) | `src/governance/audit/AuditLog.ts` | Tamper-evident append-only event log. |
| `IncidentManager` + `EmergencyStop` | `src/governance/incidents/` | Detect, contain, halt. |
| Claude CLI security hooks | `templates/claude/hooks/` | Same checks inside Claude Code's tool execution. |
| `PrivacyMode` + `DataRetentionPolicy` | `src/privacy/` | Limit what is recorded and for how long. |
| Enterprise governance + RBAC | `src/governance/enterprise/` | Team-level policy + role permissions. |
| `TrustReport` | `src/governance/TrustReport.ts` | Single document summarising the current trust posture. |

## Where Phase 7 leaves Phase 6

| Phase 6 module | After Phase 7 |
|---|---|
| `safety.ts` | wrapped by `CommandGuard` (still authoritative, but extended) |
| `redaction.ts` | reused by `SecretRedactor`, `AuditLog`, `IncidentManager` |
| `approvalGate.ts` | superseded by `ApprovalWorkflow` for high-risk operations; kept for back-compat |
| `autonomyPolicy.ts` | still authoritative for self-iteration; `forbidden_self_modifications` enforced |
| `eventStore.ts` | unchanged; events now mirrored into tamper-evident audit log |
| `replaySystem.ts` | replay bundle export gated by `report_export` policy decision |
| `governanceDecisionLog.ts` | retained; new audit log is system-wide hash chain |

## Reading order

- `docs/threat-model.md`
- `docs/security-policy-engine.md`
- `docs/permissions-and-capabilities.md`
- `docs/untrusted-repository-mode.md`
- `docs/prompt-injection-defense.md`
- `docs/secrets-and-privacy.md`
- `docs/supply-chain-guard.md`
- `docs/command-and-filesystem-guard.md`
- `docs/approval-workflow.md`
- `docs/audit-log.md`
- `docs/incident-response.md`
- `docs/data-retention.md`
- `docs/plugin-mcp-security.md`
- `docs/enterprise-governance.md`
- `docs/trust-report.md`
- `docs/claude-security-hooks.md`
