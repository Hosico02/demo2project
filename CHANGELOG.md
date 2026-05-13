# Changelog

## 0.0.8 — Phase 8: Productization, Developer Experience & Ecosystem Integration

**Goal:** ship Demo2Project as a product, not a research artifact.

### Added

- **ConfigManager** with unified schema (`schema_version: 0.0.8`), profiles (`conservative` / `balanced` / `autonomous`), migration, diff (with downgrade detection), explain, sanitized export.
- **SetupWizard** (`init --interactive` / `init --profile <p>` / `init --dry-run`) producing a per-project setup plan with recommendation, generated config, and next steps.
- **OnboardingGuide + Quickstart** — `pnpm demo2project quickstart --use-example` runs a 5-minute analyze/gap/trust/qa loop against `examples/bad-demo`.
- **ReportSystem** — Markdown / JSON / HTML renderers + 11 report types (project, gap, qa, trust, security, evaluation, generalization, autonomy, incident, workspace, self-check).
- **DiagnosticSystem + ErrorCatalog** — stable `D2P_*` error codes with likely_causes / recommended_actions / related_commands / related_docs.
- **Claude integration UX** — `claude:setup` (install hooks + settings), `claude:doctor`, `claude:generate-settings`, `claude:provider-guide`.
- **GitHub Actions templates** — preflight (PR), regression (push to main), trust-report (weekly+dispatch, artifact upload), benchmark (dispatch), self-check (push+PR+dispatch).
- **Extension system** — manifest schema (10 types), security review (static analysis + permission flags), registry, loader that never crashes core, install/disable lifecycle.
- **TypeScript SDK** at `src/sdk/index.ts` (`Demo2ProjectClient`) with `analyze`, `gap`, `qa.preflight`, `security.trustReport`, `security.trustCheck`, `security.policyCheck`, `config.effective`, `config.applyProfile`. SDK defaults to `conservative` profile; never bypasses `SecurityPolicyEngine`.
- **Recipes** — 7 archetype recipes (node-cli, ts-library, react, nextjs, python-cli, fastapi, agent-framework) + recommender + dry-run runner.
- **CompatibilityManager** — node/pnpm/git/claude/python/tsc detection with required-action list.
- **MigrationManager** — backup → migrate → verify → audit, dry-run by default.
- **ProductReadinessScorer** — 8 dimensions (installability, cli_ux, documentation, integration, safety_defaults, report_quality, migration, supportability) with grade `demo / usable / shipping / mature`.
- **UXQualityChecker** — 8 UX checks (Quickstart present, doctor/next/quickstart commands exist, error catalog exists, troubleshoot doc exists, etc.).
- **DocsChecker** — verifies the required documentation tree exists.
- **30+ new docs** in `docs/getting-started/`, `docs/concepts/`, `docs/guides/`, `docs/reference/`, `docs/advanced/`, `docs/security/`.
- **3 SDK examples** in `examples/sdk/`.
- **44 new test specs** (Phase 8) on top of the 97 from Phase 7.
- **Phase 8 self-check probes** — 22 capability probes added to `self-check`.

### Changed

- `init` now dispatches to the SetupWizard when given `--interactive`, `--profile`, `--dry-run`, or `--project`. Legacy `init` (no flags) still bootstraps the original config files.
- `HELP` text reorganised into Quickstart / Core / Iteration / Reports / Security / Product / Help groups.
- `selfCheck` returns non-zero if any Phase 6, 7, or 8 probe fails.

### Removed

- Nothing. Phase 8 is strictly additive.

---

## 0.0.7 — Phase 7: Trust, Safety, Security & Enterprise-Grade Governance

Threat model, security policy engine, capability tokens, untrusted repo mode,
prompt injection defense, secret protection, supply chain guard, command/file/
network guards, approval workflow, tamper-evident audit log, incident response,
emergency stop, privacy modes, data retention, plugin/MCP/hook scanners,
enterprise governance + RBAC, trust report, 8 Claude security hooks.

## 0.0.6 — Phase 6: Long-Horizon Autonomy & Self-Improving Engineering System

AutonomyPolicy (L0–L5), LongHorizonAutonomyController, QualityTrendMonitor,
ArchitectureDriftDetector, RegressionBisector, SelfImprovementEngine (plan-only),
PlannerCalibration, ExecutorReliability, QAMemoryHealthManager, ReplaySystem,
ScenarioStressTester, GovernanceDecisionLog, HumanHandoffReport.

## 0.0.5 — Phase 5: Cross-Project Generalization & Adaptive Learning

11 archetype detector, base/archetypes/learned standards, transferable QA
patterns, corpus, CrossProjectLearningEngine, learning governance, failure
taxonomy, project similarity, redaction enhancements.

## 0.0.4 — Phase 4: Real-World Generalization & Control

Real `ClaudeCliProvider`, EvidenceGraph + ClaimNode, anti-gaming scorer,
benchmarks public/hidden, `long-run` CLI, cost tracking, approval gate,
self-iterate-sandbox.

## 0.0.3 — Phase 3: Evaluation & Proof

NaiveBaselineProvider, A/B eval framework, evidence-weighted scoring,
QA case lifecycle, 8 benchmark cases.

## 0.0.2 — Phase 2: Hardening / Anti-Trap

FutureProvider placeholders, IterationWorkspace, Claude CLI hooks templates,
DocsTruthChecker, three-layer QA memory, 7 project standards, sandboxed
benchmarks.

## 0.0.1 — Phase 1: Runnable MVP

8 agents, 9-dimension project score, AgentProvider seam, verification gate,
9 CLI commands, bad-demo example.
