# Model-Backed Advisory Agents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add model-backed advisory agents that can research, critique and enrich demo-to-product iterations without becoming the final product-readiness judge.

**Architecture:** Introduce a narrow advisory provider interface that returns structured findings and task proposals. Supervisor optionally runs advisory agents after deterministic gap analysis and before planning; planner converts accepted advisory output into normal `AgentTask`s, so verifier/scorer gates still decide completion.

**Tech Stack:** TypeScript, Vitest, existing `AgentProvider` patterns, MiniMax OpenAI-compatible chat API for the first real advisory provider.

---

### Task 1: Advisory Types And Mock Provider

**Files:**
- Create: `src/agents/advisory/AdvisoryProvider.ts`
- Create: `src/agents/advisory/MockAdvisoryProvider.ts`
- Test: `tests/advisoryAgents.test.ts`

- [ ] Add structured advisory request/report types.
- [ ] Add deterministic mock provider for tests.
- [ ] Verify advisory reports carry source urls, findings, task proposals and gate policy metadata.

### Task 2: Model Advisory Agent And MiniMax Provider

**Files:**
- Create: `src/agents/advisory/ModelAdvisoryAgent.ts`
- Create: `src/agents/advisory/MiniMaxAdvisoryProvider.ts`
- Test: `tests/advisoryAgents.test.ts`

- [ ] Add role-specific agents for market comparison, gap critique, planner critique and reviewer critique.
- [ ] Add a MiniMax provider that requests strict JSON and never writes files.
- [ ] Verify invalid provider JSON fails closed instead of silently passing.

### Task 3: Planner And Supervisor Integration

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/iterationPlanner.ts`
- Modify: `src/agents/SupervisorAgent.ts`
- Test: `tests/advisoryAgents.test.ts`
- Test: `tests/supervisorFlow.test.ts`

- [ ] Add optional advisory metadata to `GapReport` and `IterationPlan`.
- [ ] Convert high-confidence advisory task proposals into normal tasks with verification commands.
- [ ] Emit advisory events and evidence graph entries from Supervisor.

### Task 4: CLI And Documentation

**Files:**
- Modify: `src/cli/commands/iterate.ts`
- Modify: `src/cli/index.ts`
- Modify: `README.md`
- Test: `tests/cli/helpOutput.test.ts`

- [ ] Add `iterate --advisory-agents --advisory-provider minimax`.
- [ ] Keep network/model use opt-in and compatible with existing `--web`.
- [ ] Document that advisory agents can influence planning but not readiness gates.

### Task 5: Verification

**Files:**
- No new code files.

- [ ] Run targeted advisory and supervisor tests.
- [ ] Run `pnpm build`.
- [ ] Run `pnpm test`.
- [ ] Run `pnpm run site:check` and `pnpm run site:build`.
