# Iteration process

The single closed loop the Supervisor drives:

```
Scan ─► Score ─► Gap ─► Plan ─► Execute ─► Verify ─► Review ─► Learn ─► Regress ─► Repeat
```

## Per-step contract

### 1. Scan — `AnalyzerAgent.snapshot()`
Input: `project_path`
Output: `ProjectSnapshot` — package manager, language, test/build/start
commands, important files, missing files, dependency counts.

### 2. Score — `AnalyzerAgent.score(snapshot)`
Input: snapshot
Output: `ProjectScore` — total 0–100 + 9-dim breakdown + grade
(`raw_demo` / `working_demo` / `structured_prototype` /
`project_ready_candidate` / `production_ready_baseline`).

### 3. Gap — `AnalyzerAgent.gap(snapshot, score)`
Input: snapshot + score + ProjectStandard
Output: `GapReport` — findings ordered by severity (blocker → low), plus
recommendations and a blockers shortcut.

### 4. Plan — `PlannerAgent.plan(gap, goal)`
Input: gap + user goal
Output: `IterationPlan` — at most 4 tasks per iteration, each with
`acceptance_criteria`, `expected_changed_files`, `verification_commands`,
priority, and stop conditions for the round.

### 5. Execute — `ExecutorAgent.execute(task, ctx)`
Input: task + AgentContext
Output: `AgentResult`
**Policy enforced here**: if `changed_files` is non-empty AND no
`verification_evidence` AND no `unable_to_verify_reason` → status is
downgraded to `failed` with a structured policy_violation.

### 6. Verify — `VerifierAgent.verify(projectPath, result, extras)`
Re-runs canonical project commands (when injected by the Supervisor) and
appends their results to the existing evidence. Idempotent.

### 7. Review — `ReviewerAgent.review(task, result)`
Returns rule-based findings (`missing_validation_after_code_change`,
`forbid_unverified_completion`, `inconsistent_status`, etc.). Findings are
appended to the event log so QA can learn from them.

### 8. Learn — `QAAgent.learnFromEvents()`
Generates QACases (deduped by fingerprint), persists to the project, then
upserts the system-level regression spec.

### 9. Regress — `QARegressionRunner.runRegression()`
Loads ALL recorded events + summaries for a project, replays the named
workflow assertions, returns pass/fail per assertion.

### 10. Repeat / stop
The Supervisor stops when:
- score reaches `production_ready_baseline`, OR
- `maxIterations` is exhausted, OR
- two consecutive rounds produce no score gain, OR
- a blocker is unrecoverable, OR
- a safety violation is recorded, OR
- the user requested stop.

## Events emitted per iteration

| event_type | when |
|------------|------|
| `iteration_started` | Supervisor opens the round |
| `task_assigned` | Supervisor hands a task to the Executor |
| `task_completed` / `task_failed` | After verifier + reviewer agree |
| `verification_passed` / `verification_failed` | Per command |
| `review_finding` | Reviewer emits a rule violation |
| `qa_case_created` / `qa_case_updated` | QA Agent persists a case |
| `note` | Preflight + other informational entries |
| `iteration_finished` | Supervisor closes the round |

All events go to `<project>/.demo2project/events/<iter>.jsonl`.
