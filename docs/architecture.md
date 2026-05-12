# Architecture

## Positioning (read this first)

Demo2Project is a **control layer**, not a coding agent. The layering is:

```
   ┌─────────────────────────────────────────────────────────────┐
   │  User / CI                                                  │
   └──────────────────────────┬──────────────────────────────────┘
                              │
   ┌──────────────────────────▼──────────────────────────────────┐
   │  Demo2Project (control plane)                               │
   │  ─ Supervisor / Analyzer / Planner / Verifier / Reviewer    │
   │  ─ Project Scorer / Gap Analyzer / Standards library        │
   │  ─ QA Learning (repo/workspace/global memory)               │
   │  ─ Verification Gate + Docs Truth Checker                   │
   │  ─ IterationWorkspace (branch isolation + rollback)         │
   │  ─ Event Store + Regression Runner                          │
   └──────────────────────────┬──────────────────────────────────┘
                              │ AgentProvider seam
   ┌──────────────────────────▼──────────────────────────────────┐
   │  Executors (interchangeable)                                │
   │  Mock | LocalCommand | RuleBasedExecutor | ClaudeCode |     │
   │  Codex (planned) | Devin (planned) | OpenHands (planned) |  │
   │  Aider (planned) | …                                        │
   └─────────────────────────────────────────────────────────────┘
```

Supervisor never speaks to a model directly — it goes through `AgentProvider`.
Replace the provider and the loop, scoring, gating, and QA learning all keep
working unchanged.

## Module map

```
src/
  core/        type-only contracts + framework-neutral primitives
    types.ts            all data shapes
    projectSnapshot.ts  fs scan → ProjectSnapshot
    projectScorer.ts    snapshot → ProjectScore (9-dim breakdown)
    gapAnalyzer.ts      snapshot+score+standard → GapReport
    iterationPlanner.ts gap → IterationPlan (bounded; verifiable tasks)
    eventStore.ts       JSONL append-only event log + iteration summaries
    commandRunner.ts    safe subprocess execution with timeout
    safety.ts           dangerous-command blocklist
    redaction.ts        secret-pattern masking for log/QA output

  agents/      orchestration layer (no I/O of its own beyond the store)
    SupervisorAgent.ts  drives the closed loop
    AnalyzerAgent.ts    wraps snapshot+scorer+gapAnalyzer
    PlannerAgent.ts     wraps iterationPlanner
    ExecutorAgent.ts    wraps an AgentProvider; enforces verification policy
    VerifierAgent.ts    re-runs verification; appends evidence
    ReviewerAgent.ts    rule-based audit
    MemoryAgent.ts      cross-iteration fingerprint counts
    providers/
      AgentProvider.ts        interface (runTask(task,ctx) → AgentResult)
      MockAgentProvider.ts    deterministic (default in MVP)
      LocalCommandProvider.ts whitelisted subprocess
      ClaudeCodeProvider.ts   placeholder; arm via DEMO2PROJECT_CLAUDE_CODE=1

  qa/          QA learning subsystem
    QACase.ts            re-exports types
    QACaseStore.ts       persisted cases + regression spec
    QACaseGenerator.ts   event → QACase[] (one detector per failure mode)
    QADeduplicator.ts    fingerprint dedup
    QAAgent.ts           preflight + learnFromEvents + upsertRegressionSpec
    QARegressionRunner.ts replay workflow assertions over recorded history
    workflowAssertions.ts seven named, pure-function assertions

  standards/   project-ready baseline
    defaultProjectStandard.ts

  cli/         argument parser + per-command handlers

  utils/       fs / json / paths / time helpers
```

## Data flow per iteration

```
        snapshot     score       gap       plan       results       events     QA cases
project ───────► ────────► ─────► ────────► ────────────► ───────► ──────────►
                                                 │                              │
                                                 └──► EventStore (JSONL) ◄──────┘
```

## Where state lives

| Path | Purpose |
|------|---------|
| `<project>/.demo2project/events/<iter>.jsonl` | append-only event log per iteration |
| `<project>/.demo2project/iterations/<iter>.json` | full IterationSummary |
| `<project>/.demo2project/qa-cases.json` | persisted QA cases for that project |
| `<systemRoot>/qa/specs/qa-regression.spec.json` | accumulated cases + assertions list |

## Provider roadmap (planned JSON protocol)

`ClaudeCodeProvider` will shell out to the `claude` CLI with:

```
echo '{"task": <AgentTask>, "project_path": "...", "iteration_id": "..."}' \
  | claude --headless --json
```

Expected stdout: a single JSON object matching `AgentResult`. The provider
must validate before returning — invalid JSON → `status: failed` with
`failures: ["provider_protocol_error"]`. We deliberately do not enable this
in MVP so the closed loop stays fully deterministic.

## Why these boundaries

- **Pure agents.** Agents take inputs, return outputs, and write events via
  a single `EventStore`. No agent imports the CLI; no agent talks to another
  agent directly — the Supervisor wires them.
- **One provider seam.** Swapping the model backend changes one file.
- **Deterministic default.** `MockAgentProvider` keeps tests reproducible.
- **No global state.** Every command writes under
  `<project>/.demo2project/` so concurrent projects don't collide.
