# Demo2Project

**Demo2Project is a projectization control layer — not another coding agent.**

## Quickstart

```bash
pnpm install && pnpm build
pnpm demo2project doctor                         # check your environment
pnpm demo2project init --interactive             # 30-second setup wizard
pnpm demo2project quickstart --use-example       # 5-minute analyze/gap/trust loop
pnpm run site:check                              # validate the MatrixOmnix web entry
```

Then on your real project:

```bash
pnpm demo2project analyze --project /path/to/your/repo
pnpm demo2project gap --project /path/to/your/repo
pnpm demo2project trust:check --project /path/to/your/repo
pnpm demo2project iterate --project /path/to/your/repo --provider rule-based --max-iterations 1
pnpm demo2project report:project --project /path/to/your/repo
```

Full quickstart: [`docs/getting-started/quickstart.md`](docs/getting-started/quickstart.md). CLI reference: [`docs/reference/cli.md`](docs/reference/cli.md).

Web entry: [`site/index.html`](site/index.html). The MatrixOmnix interface
ships as a static product surface with About, Service and Contact pages. The
Service page accepts demo archives (`zip`, `7z`, `rar`, `tar`, `tar.gz`,
`tgz`) and documents the productization contract: every completed artifact is
returned as a normalized `zip`.

---

It sits *above* coding agents (Claude Code, Codex, Devin, OpenHands, Aider, …)
and answers a different question:

> Has this demo actually become a maintainable project, and if not, what
> exactly is missing and how do we prove it stayed fixed?

Coding agents are the **Executor** behind a provider seam. Demo2Project owns
the parts coding agents are bad at: **Supervisor + Project Scorer + Gap
Analyzer + Verification Gate + QA Learning + Regression Memory + Docs Truth
Check + Workspace Isolation**.

The thesis is simple: the bottleneck in demo→project work is not raw code
generation — it is *enforced discipline*. AI agents skip verification, claim
completion without evidence, reintroduce yesterday's bug, and ship READMEs
that lie about what runs. Demo2Project mechanically prevents each of those
failure modes.

| What we do NOT do | What we DO do |
|---|---|
| Compete with Claude Code / Codex / Devin on code quality | Score the **project** (not the code) against a project-ready standard |
| Generate demos | Verify demos *became* projects (and detect regression) |
| Run an LLM by default | Run a deterministic loop; LLM providers are pluggable |
| Trust agent self-reports | Re-run verification independently and refuse unverified completions |
| Forget across sessions | Persist fingerprinted QA cases at repo / workspace / global scopes |

---

## What this solves

Demos typically lack: tests, build scripts, error handling, docs, config
hygiene, CI, regression coverage. Each individual gap is easy to describe but
hard to *consistently* close — AI agents skip verification, claim success
without evidence, lose context across runs, and reintroduce yesterday's bug.

Demo2Project enforces a discipline:

1. **Score** the project against a project-ready standard.
2. **Find gaps** with severity + suggested fix.
3. **Plan** a small batch of tasks (max 4 / iteration) each with acceptance
   criteria and verification commands.
4. **Execute** via a pluggable `AgentProvider` (Mock / LocalCommand / a future
   ClaudeCode provider).
5. **Verify**: every code change must produce verification evidence **or** an
   explicit `unable_to_verify_reason`. No exceptions — the supervisor downgrades
   completion to failure when this is violated.
6. **Repair failed verification first**: a failed command becomes a blocker
   repair task before normal productization continues.
7. **Review** the result against the project standard.
8. **Learn**: the QA Agent extracts QA Cases (fingerprinted, deduped, persisted)
   from the iteration events and updates `qa/specs/qa-regression.spec.json`.
9. **Regress**: the QA runner replays workflow assertions over the iteration
   history of any project to ensure old failure modes do not return.

It now also runs a **misjudgment audit** before planning: high-risk findings
such as CLI/API/UI/LLM/social-deduction classifications are cross-checked
against concrete project evidence. If a finding lacks enough evidence, the
Analyzer records an agent-discovered misjudgment and suppresses that task
before Executor can mutate the wrong project surface.

## Harness Coverage

Demo2Project treats a "product" as a set of verified contracts, not a prettier
demo. Current harness families include:

- **Single-file intake/runtime** — captures `demo.py`, `app.js`, `index.html`
  and similar raw entries before expansion.
- **CLI executable contract** — verifies installed/declared CLI entries expose
  a stable `--help` contract.
- **API contract/runtime** — detects Flask/FastAPI/Express/Fastify/Hono-style
  surfaces and requires a route contract harness.
- **Config contract** — extracts environment-variable usage and checks
  `.env.example` coverage.
- **Data/migration contract** — detects ORM/schema/migration surfaces and
  requires explicit schema evidence.
- **Worker contract** — detects queues, scheduled jobs and background workers
  before productizing async behavior.
- **UI product verification** — checks browser harnesses, render smoke,
  accessibility, responsive layout and common interaction risks.

---

## Architecture (one screen)

```
                 ┌─────────────┐
   User goal ───►│ Supervisor  │◄── ProjectStandard
                 └────┬────────┘
                      │
       ┌──────────────┼───────────────────┐
       ▼              ▼                   ▼
   Analyzer ──► Planner ──► Executor (Provider) ──► Verifier ──► Reviewer
       │                                                              │
       └──────────────► EventStore (JSONL) ◄──────────────────────────┘
                              │
                              ▼
                         QA Agent ──► QACaseStore + qa-regression.spec.json
                              │
                              ▼
                       Memory Agent (fingerprint dedup, frequency)
```

Each agent is a small TypeScript class — see `src/agents/`. Providers live in
`src/agents/providers/`.

---

## Multi-agent roles

| Agent | Responsibility |
|-------|----------------|
| Supervisor | Owns the loop; assigns tasks; enforces stop conditions |
| Analyzer | Scans, scores, produces gap report |
| Planner | Turns gaps into bounded, verifiable tasks |
| Executor | Wraps an `AgentProvider`; enforces verification policy |
| Verifier | Independently re-runs verification; appends evidence |
| Reviewer | Rule-based audit (forbid unverified completion, etc.) |
| QA Agent | Generates / dedupes / persists QA cases; updates regression spec |
| Memory Agent | Cross-iteration fingerprint counts, recurrence detection |

---

## Iteration closed loop

```
Scan ─► Score ─► Gap ─► Plan ─► Execute ─► Verify ─► Review ─► Learn ─► Regress ─► Repeat
```

See `docs/iteration-process.md` for the step-by-step inputs/outputs.

---

## How QA Agent learns from BUGs

Every iteration appends events to `<project>/.demo2project/events/<iter>.jsonl`.
After tasks finish, the QA Agent:

1. Reads the iteration's events.
2. Runs detectors → emits QA cases with a stable **fingerprint** (e.g.
   `missing_validation_after_code_change`).
3. Dedupes by fingerprint; merges into `<project>/.demo2project/qa-cases.json`.
4. Bumps `frequency` for recurring fingerprints.
5. Upserts into the system-level `qa/specs/qa-regression.spec.json` so the
   knowledge is available cross-project.
6. Future iterations run a **preflight** that warns about active cases.
7. `demo2project qa:regression` replays workflow assertions over recorded
   history — your CI line for not regressing.

See `docs/qa-agent.md` for the QA Case schema and dedup strategy.

---

## Install & run

```bash
pnpm install
pnpm build
pnpm test
```

CLI usage (after build):

```bash
pnpm demo2project analyze --project ./werewolf-demo --evidence --verify
pnpm demo2project gap --project ./werewolf-demo --evidence --verify
pnpm demo2project long-run --project ./werewolf-demo --provider minimax-m27 --hours 10 --in-place --output reports/long-run/werewolf.json
```

For MiniMax M2.7, set `DEMO2PROJECT_MINIMAX=1` and `MINIMAX_API_KEY`. The
default MiniMax base URL is `https://api.minimaxi.com/v1`; override it with
`MINIMAX_BASE_URL` when needed.

```bash
# Inspect a project
pnpm demo2project analyze --project examples/bad-demo
pnpm demo2project gap --project examples/bad-demo
pnpm demo2project plan --project examples/bad-demo --goal "project-ready"

# Run one mock iteration (no external LLM)
pnpm demo2project iterate \
  --project examples/bad-demo \
  --goal "project-ready" \
  --max-iterations 1 \
  --provider mock --mode happy

# QA workflow
pnpm demo2project qa:preflight --project examples/bad-demo
pnpm demo2project qa:regression --project examples/bad-demo

# Run the whole pipeline on this repo
pnpm demo2project self-check
```

All persisted state lives under `<project>/.demo2project/` — safe to delete
to start fresh.

---

## Provider design

`AgentProvider` is the swap point. Implementations:

- `MockAgentProvider` — deterministic; used by tests and the MVP.
- `LocalCommandProvider` — runs whitelisted local commands (e.g. test, build).
- `RuleBasedExecutor` — deterministic executor that writes a small supported
  set of projectization fixes and records verification evidence. It now covers
  README/env/gitignore/CI/smoke tests plus single-file intake, CLI, API,
  config, data, worker and UI harness scaffolds.
- `ClaudeCodeProvider` — real `claude -p` subprocess driver. Set
  `DEMO2PROJECT_CLAUDE_CODE=1` to arm; the JSON protocol is documented in
  `docs/architecture.md`.

The system **must work end-to-end without any external API** — that is the
MVP guarantee. Real model-driven providers attach in Phase 2.

---

## Current limits

- Deterministic execution is intentionally conservative: `RuleBasedExecutor`
  can establish productization harnesses and repair supported patterns, but
  broad feature implementation still belongs to a model-backed provider.
- Reviewer is rule-based, not diff-based.
- Score weights are heuristic; tune via `config/project-standard.json`.
- QA runner asserts over recorded *events*, not live re-runs of commands.
- The static MatrixOmnix Service page validates upload intent and archive
  format; production upload processing still needs a deployed API/service
  boundary wired to the CLI long-run pipeline.

---

## Roadmap

v0.0.6 = Phase-6 long-horizon autonomy & self-improving engineering. v0.0.5
proved we generalize across projects; **v0.0.6 proves we can run many
rounds without losing quality, detect when we should stop, refuse to
modify our own safety surface, and hand off cleanly to a human when stuck**.

### v0.0.6 — Long-Horizon Autonomy & Self-Improving Engineering System

- **`AutonomyPolicy` (6 levels)** — L0 read-only → L5 long-run.
  `config/autonomy-policy.json` declares the budget,
  `forbidden_self_modifications` list, and rollback rules. CLIs:
  `autonomy:policy / set-level / explain`.
- **`LongHorizonAutonomyController`** — session lifecycle wrapper around
  the supervisor with per-iteration trend snapshots, drift checks, and a
  governance decision log. CLIs: `autonomy:run / status / report`,
  `long-run`.
- **`QualityTrendMonitor`** — emits `continue / stop / rollback /
  request_approval` decisions from the iteration trend window. CLIs:
  `trend:show / explain`.
- **`ArchitectureDriftDetector`** — captures architecture fingerprints,
  flags file-count explosions, dependency bloat, test/source imbalance,
  oversized files, top-level dir sprawl. CLIs: `drift:check / compare`.
- **`RegressionBisector`** — walks recorded iterations, identifies the
  first iteration where score dropped or verification failed. CLIs:
  `regression:bisect / explain`, `rollback:stable`.
- **`SelfImprovementEngine`** — hypothesis → experiment workflow.
  Hypotheses touching `forbidden_self_modifications` paths are
  auto-rejected at proposal time. Real mutation deferred to a later phase
  by design. CLIs: `self:diagnose / hypotheses / experiment / accept /
  reject / rollback`.
- **`PlannerCalibrationEngine`** — records predicted vs actual deltas.
  Surfaces worst-predicted categories. CLIs: `planner:calibrate / report
  / explain`.
- **`ExecutorReliabilityModel`** — per-provider per-task-category
  reliability with `confidence_score`. CLIs: `executor:reliability /
  recommend / compare`.
- **`QAMemoryHealthManager`** — memory noise + usefulness scores,
  duplicate cluster detection, merge/retire/promote suggestions, conservative
  `qa:compact --apply`. CLIs: `qa:health / compact / merge / retire-stale
  / report-memory`.
- **`ReplaySystem`** — redacted reproducibility bundles. Source code is
  NOT bundled — pair with `git_ref`. CLIs: `replay:create / run / explain`.
- **`ScenarioStressTester`** — 15 named scenarios, run as a single command
  to confirm defensive behavior. CLIs: `scenario:list / run`.
- **`GovernanceDecisionLog`** — append-only JSONL of every autonomous
  decision. CLIs: `governance:log / explain`.
- **`HumanHandoffReport`** — structured handoff when stuck, with blockers,
  recommended actions, files to review, commands to run. CLIs:
  `handoff:create / show`.

### v0.0.6 verification (this commit)

- `pnpm test` → **62 files / 204 specs, all passing**
- `pnpm demo2project self-check` → **all 19 Phase-6 probes green**
- `pnpm demo2project scenario:run --all` → **15/15 scenarios pass**

### v0.0.5 — Cross-Project Generalization & Adaptive Learning

- **`ProjectArchetypeDetector`** — 11 archetypes (node-cli, typescript-library,
  react-app, nextjs-app, python-cli, python-package, fastapi-api, monorepo,
  docs-only-project, agent-framework, unknown) with explainable weighted-signal
  scoring. CLI: `archetype --project`.
- **Adaptive standards** — reorganized to `src/standards/{base,archetypes,learned}/`.
  `AdaptiveProjectStandardManager` auto-selects per archetype, with optional
  `learned/workspace-standard-overrides.json` overlay. CLIs:
  `standards:list / explain / validate`.
- **Transferable QA patterns** — `transferability` field on `QACase`
  (`applicable_archetypes` / `excluded_archetypes` / `required_project_signals`
  / `excluded_project_signals` / `portability_score`). `TransferabilityEvaluator`
  filters preflight per archetype. CLIs: `qa:transfer`, `qa:applicable`.
- **Project corpus** — local-only index of evaluated projects with
  path-hash + redaction. CLIs: `corpus:add / list / evaluate / remove / report`.
- **Cross-project learning** — `CrossProjectLearningEngine` aggregates
  anonymized reports → `LearningPattern[]`. CLIs: `learn:workspace / project
  / patterns / explain`.
- **Learning governance** — promotion candidates (repo→workspace,
  workspace→global) with manual approval gate for high-risk. CLIs:
  `learning:candidates / approve / reject / explain`.
- **Standard feedback loop** — `standards:suggest-updates`, with
  approve/reject CLIs.
- **Generalization evaluator** — `generalize --all [--report]`
  aggregates per-archetype success rate, weakest archetypes, recommended
  standard updates.
- **Project similarity** — Jaccard over deterministic signals.
  `similar --project` returns ranked historical-project hits.
- **Adaptive QA preflight** — `QAAgent.preflight` now detects archetype
  and filters cases via `TransferabilityEvaluator`. Adds `archetype` /
  `applicable` / `skipped` to the preflight result.
- **Workspace dashboard** — `report:workspace` emits 6 markdown reports
  to `reports/workspace/` (generalization, qa-memory, standard-feedback,
  corpus, executor-comparison).
- **Failure taxonomy** — fixed enum of ~35 categories under 8 buckets;
  shared join key for QA cases, gap findings, learning patterns. CLIs:
  `taxonomy:list / explain`.
- **Privacy redaction enhanced** — emails, `/Users/<n>` & `/home/<n>`
  paths, IPv4, DB URLs. CLI: `redact:test`.

### Generalization proof

Pointing v0.0.5 at unseen sibling project `/Users/mack/Desktop/Hosico/Works/Work/mentor`
(never in any benchmark): `archetype --project` correctly returned
`python-package` and selected the matching standard. Three unseen Python
projects classified consistently. Corpus entry persisted with the absolute
path redacted to `/Users/***/Desktop/Hosico/Works/Work/mentor`.

### v0.0.4 — Real-World Generalization & Control

- **Real `ClaudeCliProvider`** — `--provider claude-cli --enabled` shells out
  to the actual `claude -p` CLI. Before/after filesystem fingerprinting,
  confidence scoring (high/medium/low), and **low-confidence results never
  reach `completed`**. End-to-end verified in v0.0.4 against `claude` 2.1.139.
- **Evidence graph** — `EvidenceNode` + `ClaimNode` types persisted at
  `.demo2project/evidence/<iter>.json`. New CLIs: `evidence:show`,
  `evidence:explain`.
- **Anti-gaming detectors** — empty tests, sham assertions (`assert(1==1)`),
  echo-only build scripts, fake CI, secrets in source, dependency bloat.
  Penalties flow into the evidence-weighted score; `confidence_adjusted_score`
  added.
- **`benchmarks/public/` + `benchmarks/hidden/`** — hidden cases use
  `hidden_defects.json` (NOT `known_defects`) so they survive overfitting.
  `eval --include-hidden` is the generalization gate.
- **`long-run` CLI** — N iterations with trend reporting:
  `score_trend`, `qa_memory_growth`, `docs_truth_trend`,
  `final_stability_rating` (`stable` / `degraded_after_peak` / `volatile`).
- **Cost tracking** — every iteration writes a `CostRecord`
  (`wall_time_ms`, `command_count`, `token_estimate`, `retry_count`,
  `cost_per_score_point`). `cost:report` CLI.
- **Multi-executor comparison** — `compare-executors --case <n> --providers <list>`
  runs the same fixture through several providers and prints a comparison
  table.
- **Human approval gate** — `recordPendingApprovals` flags medium/high-risk
  paths; `approvals:list / approve / reject` CLIs. Default policy in
  `config/approval-policy.json`.
- **`self-iterate-sandbox`** — worktree-bounded self-mutation with mandatory
  `pnpm test` + `pnpm build` + score gate. `--apply` only.
- **10 new tests** — evidenceGraph, antiGamingScorer, costTracking,
  humanApprovalGate, hiddenBenchmark, multiExecutorComparison,
  longHorizonEvaluation, qaMemoryAudit, selfIterationSandbox, plus the
  expanded claudeCliProvider contract.

### v0.0.3 — Evaluation & Proof

- **A/B framework** — `eval --all | --case <name>` runs every benchmark
  through BOTH paths (`NaiveBaselineProvider` vs Demo2Project Supervisor loop)
  and emits a JSON + Markdown report under `reports/evaluation/`.
- **Headline result (8 cases):** Demo2Project wins **8/8**, average score
  Δ **+18.1**, baseline `unverified_changes` 3–4 per case vs Demo2Project's **0**.
- **Evidence-weighted scoring** — `scoreProjectWithEvidence` penalizes README
  claims without matching scripts, declared-but-unrun test commands, and CI
  configs that have nothing to run. Prevents "drop empty files for free score".
- **QA case lifecycle** — `new` → `active` → `confirmed` (TP ≥ 2) → `noisy`
  (FP > TP, n ≥ 3) → `retired`. CLI: `qa:audit`, `qa:retire`, `qa:promote`.
- **8 benchmarks** — bad-node-cli, bad-ts-library, bad-react-app, bad-next-app,
  bad-python-cli, bad-fastapi-api, bad-docs-project, bad-monorepo — each with
  `known_defects.json` + `evaluation_notes.md`.
- **ClaudeCliProvider contract test** — `provider:test --provider claude-cli`
  drives the adapter; tests verify it degrades gracefully when the binary is
  missing.
- **+25 tests** — `evidenceWeightedScorer`, `scoreGamingPrevention`,
  `qaCaseLifecycle`, `regressionEffectiveness`, `evaluationRunner`,
  `benchmarkSuite`, `claudeCliProvider`.

### v0.0.2 — Phase-2 hardening

- **Repositioned**: README and `docs/architecture.md` make explicit that
  Demo2Project is a **control layer**, not a coding agent. Coding agents are
  pluggable executors behind `AgentProvider`.
- **Provider isolation**: New `FutureProvider` stubs for Codex / Devin /
  OpenHands / Aider. A dedicated `providerIsolation.test` asserts the
  Supervisor never imports a concrete provider class.
- **Workspace isolation**: `IterationWorkspace` snapshots the base commit,
  runs each iteration on a `demo2project/iter-<id>` branch, and supports
  `iterate --use-worktree` + a new `rollback --iteration <id>` CLI.
- **Claude CLI hooks**: `templates/claude/` ships three hooks
  (pre-tool-use-safety, post-tool-use-event-recorder, stop-verification-gate)
  and a `claude:install-hooks` command. Hooks fail open on parse error,
  fail closed on rule match, and respect `DEMO2PROJECT_HOOKS_DISABLED=1`.
- **Docs truth check**: `DocsTruthChecker` parses README commands and
  verifies them against `package.json` scripts, Dockerfile, CI config, and
  `.env.example`. New CLI `docs:truth --project`.
- **Three-tier QA memory**: cases now have `scope` and `portability`; the
  QA Agent reads `global` → `workspace` → `repo` at preflight. Seeded
  `qa/specs/global-patterns.json` with well-known AI-coding failure modes.
- **Standards library**: 7 standards under `src/standards/library/`
  (generic / node-cli / typescript-library / react-app / nextjs-app /
  python-package / fastapi-api). Analyzer auto-selects per snapshot.
- **Benchmark suite**: 4 new benchmark fixtures with `known_defects.json`,
  `hidden_checks.md`, and expected score windows. `benchmark` now copies
  each fixture to a tmp sandbox before iterating — fixtures are never
  mutated. `--case <name>` runs a single benchmark.
- **Verification gate proven**: dedicated `verificationGate.test` exercises
  all 5 invariants end-to-end.
- **Security docs**: `docs/claude-cli-integration.md` and
  `docs/plugin-security.md` describe the hook protocol, MCP caveats, and
  the right posture for running agents on untrusted repos.

### Earlier phases (kept from v0.0.1) Heavier pieces (real model
calls behind API keys, vector embeddings, autonomous self-mutation) remain
explicitly deferred — the slice exists, the integration does not.

- **Phase 1 — MVP** ✅ deterministic loop, score, gap, plan, mock executor,
  verifier, QA learning, regression runner.
- **Phase 2** ✅ slice: `RuleBasedExecutor` writes real files; `ClaudeCodeProvider`
  is a real `claude -p` subprocess driver (gated by env flag); Supervisor
  supports `retryPolicy` and `parallelism`. ⏳ still future: Claude API SDK,
  OpenAI SDK, multi-provider concurrency policy.
- **Phase 3** ✅ slice: `QASimilarity` (Jaccard token overlap, no external
  embedding model). ⏳ still future: real embeddings, cross-project KB.
- **Phase 4** ✅ slice: rule handlers for README / `.env.example` / `.gitignore` /
  `tsconfig.json` / `Dockerfile` / CI workflow / smoke test / package.json
  scripts. ⏳ still future: error-handling rewrites, automatic project
  restructuring, language coverage beyond TS/JS.
- **Phase 5** ✅ slice: read-only `self-iterate` CLI emits the plan the
  system would apply to itself. ⏳ still future: worktree-bounded
  self-mutation with revert-on-failure.
- **Phase 6** ✅ slice: a second bad-demo (Python) and a `benchmark` CLI that
  scores every project under `examples/` and prints a table. ⏳ still future:
  paired before/after benchmarks and CI integration.

## Phase 7: Trust, Safety, Security & Enterprise-Grade Governance

Phase 7 turns Demo2Project from "can run autonomously" into "can be trusted
to run autonomously in an enterprise". It adds:

- **Threat model** (20 named threats; `security:threat-model`)
- **SecurityPolicyEngine** with 25-rule default policy (`policy:check`, `policy:violations`)
- **CapabilityManager** — time- and use-bounded permission tokens with high-risk gating
- **Untrusted repository mode** — unknown repos blocked from network / install / hooks
- **PromptInjectionScanner + PromptContextSanitizer** — repo content cannot override system policy
- **SecretScanner / SecretExposureDetector** — over both project files and persisted state
- **SupplyChainGuard** — typo-squat heuristic, lifecycle script analysis, lockfile diff
- **CommandGuard / FileAccessGuard / NetworkGuard** with `GuardedCommandRunner` and `GuardedFileSystem`
- **ApprovalWorkflow** — risk-tiered, role-based, scope-bound, expiring
- **AuditLog with SHA-256 hash chain** — `audit:verify` detects silent tampering
- **IncidentManager + EmergencyStop** — auto-stop on critical incidents
- **PrivacyMode** (4 levels) + **DataRetentionPolicy** + **DataInventory** + **DataDeletion**
- **Plugin / MCP / Hook scanners** (defense in depth, not security boundary)
- **Enterprise governance** — 6 roles, team policy, dual-approval option
- **TrustReport** — single document summarising current safety posture
- **8 new Claude CLI security hooks** — same checks one layer closer to the model

See `docs/security-overview.md` for the full guide.
