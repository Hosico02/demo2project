# Demo2Project

**Demo2Project is a projectization control layer — not another coding agent.**

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
6. **Review** the result against the project standard.
7. **Learn**: the QA Agent extracts QA Cases (fingerprinted, deduped, persisted)
   from the iteration events and updates `qa/specs/qa-regression.spec.json`.
8. **Regress**: the QA runner replays workflow assertions over the iteration
   history of any project to ensure old failure modes do not return.

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
- `ClaudeCodeProvider` — placeholder. Set `DEMO2PROJECT_CLAUDE_CODE=1` to
  arm; the actual subprocess + JSON protocol is documented in
  `docs/architecture.md`.

The system **must work end-to-end without any external API** — that is the
MVP guarantee. Real model-driven providers attach in Phase 2.

---

## Current MVP limits

- Executor is mock-only in MVP; it does not yet write real code.
  Verification still runs against the real filesystem.
- Reviewer is rule-based, not diff-based.
- Score weights are heuristic; tune via `config/project-standard.json`.
- QA runner asserts over recorded *events*, not live re-runs of commands.

---

## Roadmap

v0.0.4 = Phase-4 real-world generalization & control. v0.0.3 proved the
loop outperforms a naive simulated agent; **v0.0.4 verifies it can drive
the real Claude CLI subprocess and gracefully refuse low-confidence output**.

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
