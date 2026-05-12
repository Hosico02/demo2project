# Demo2Project

Iteratively turn a **demo** into a **production-ready project** via a multi-agent
loop with built-in QA learning.

> AI coding tools produce demos at lightning speed but stall when you ask them
> to harden the demo into something maintainable, testable, deployable, and
> evolvable. Demo2Project is the layer that closes that gap: a Supervisor +
> Analyzer + Planner + Executor + Verifier + Reviewer + QA loop that scores
> a project against a project-ready standard, plans small fixes, runs them,
> verifies them, and **learns from every failure** so the same mistake does
> not show up twice.

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

v0.0.1 ships **Phase 1 in full** plus a minimal runnable slice of every later
phase so the architecture is end-to-end provable. Heavier pieces (real model
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
