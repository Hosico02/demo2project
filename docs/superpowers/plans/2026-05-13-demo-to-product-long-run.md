# Demo To Product Long Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Demo2Project from a checklist-oriented projectization loop into a verification-gated, bug-repair-aware, long-running demo-to-product system.

**Architecture:** Add a fail-closed score gate, feed verification failures back into planning as first-class repair tasks, let QA cases affect task priority, harden model provider output handling, and add a benchmark/long-run reporting harness. Keep existing agent/provider seams intact and implement changes behind small core modules.

**Tech Stack:** TypeScript, Node.js, Vitest, pnpm, existing Demo2Project agents/providers, Python fixture projects for benchmark validation.

---

### Task 1: Score Gate

**Files:**
- Create: `src/core/scoreGate.ts`
- Modify: `src/core/types.ts`
- Modify: `src/core/evidenceWeightedScorer.ts`
- Test: `tests/scoreGate.test.ts`

- [ ] Write tests proving failed test/build verification caps total score.
- [ ] Implement `evaluateScoreGate()` with caps for failed tests, failed build/import, unverified changes, and high-severity open gaps.
- [ ] Integrate gate evidence into evidence-weighted scoring.
- [ ] Verify with `pnpm exec vitest run tests/scoreGate.test.ts`.

### Task 2: Failed Verification Repair Loop

**Files:**
- Create: `src/core/verificationRepair.ts`
- Modify: `src/agents/SupervisorAgent.ts`
- Modify: `src/agents/PlannerAgent.ts`
- Test: `tests/verificationRepairLoop.test.ts`

- [ ] Write tests where first provider attempt fails verification and second repair task passes.
- [ ] Implement repair task creation from failed command, exit code, output summary, files changed, and related paths.
- [ ] Stop normal gap task execution after a failed verification and run repair attempts first.
- [ ] Verify with `pnpm exec vitest run tests/verificationRepairLoop.test.ts tests/supervisorFlow.test.ts`.

### Task 3: QA-Aware Planning

**Files:**
- Modify: `src/qa/QAAgent.ts`
- Modify: `src/core/iterationPlanner.ts`
- Test: `tests/qaPlannerPriority.test.ts`

- [ ] Write tests proving active/recurring QA cases add repair priority.
- [ ] Add planner input for QA fingerprints and recent failures.
- [ ] Promote recurring verification failure fingerprints above medium/low productization gaps.
- [ ] Verify with `pnpm exec vitest run tests/qaPlannerPriority.test.ts`.

### Task 4: Provider Reliability

**Files:**
- Modify: `src/agents/providers/MiniMaxProvider.ts`
- Create: `src/agents/providers/providerJson.ts`
- Test: `tests/minimaxProvider.test.ts`

- [ ] Extract JSON extraction/repair into a reusable helper.
- [ ] Add one invalid-output retry with stricter prompt.
- [ ] Validate edit payload shape before applying edits.
- [ ] Keep filesystem path guard and observed diff checks.
- [ ] Verify with `pnpm exec vitest run tests/minimaxProvider.test.ts`.

### Task 5: Benchmark Harness

**Files:**
- Create: `src/eval/bugRepairBenchmark.ts`
- Create: `src/cli/commands/bugBenchmark.ts`
- Modify: `src/cli/index.ts`
- Test: `tests/bugRepairBenchmark.test.ts`

- [ ] Add benchmark case schema for `agent-self-iteration/examples/*`.
- [ ] Copy each fixture to temp workspace, run baseline command, run Demo2Project, run final command.
- [ ] Record discovered/fixed/test-green/iterations/duration/provider.
- [ ] Verify with `pnpm exec vitest run tests/bugRepairBenchmark.test.ts`.

### Task 6: Long-Run Orchestrator

**Files:**
- Create: `src/eval/longRunProductization.ts`
- Modify: `src/cli/commands/longRun.ts`
- Test: `tests/longRunProductization.test.ts`

- [ ] Add `--hours`, `--case`, `--provider`, `--max-iterations`, and `--output-dir`.
- [ ] Loop analyze/plan/execute/verify/repair/report until time budget or stop condition.
- [ ] Persist JSONL events, summary JSON, markdown report, score trend, gap trend, and failure taxonomy.
- [ ] Verify with `pnpm exec vitest run tests/longRunProductization.test.ts`.

### Task 7: Reports And Docs

**Files:**
- Modify: `docs/long-horizon-autonomy.md`
- Modify: `docs/reference/cli.md`
- Modify: `README.md`
- Test: existing docs tests

- [ ] Document score gates, repair loop, benchmark command, and long-run output.
- [ ] Update CLI reference.
- [ ] Verify with `pnpm exec vitest run tests/docsStructure.test.ts tests/docsCheck.test.ts`.

### Task 8: End-To-End Verification

**Files:**
- No new files unless a failing check requires a targeted fix.

- [ ] Run `pnpm build`.
- [ ] Run targeted tests for all changed modules.
- [ ] Run `pnpm test` if targeted tests are green.
- [ ] Run a short dry-run benchmark against at least one `agent-self-iteration` fixture.
- [ ] Run a bounded real Minimax smoke on `werewolf-demo` only when local checks are green.
