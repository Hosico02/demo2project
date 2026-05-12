# QA Agent

## QACase schema

```ts
{
  id: "qa_xxxxx",                                   // stable, randomly assigned
  title: "Executor changed files without running validation",
  category: "missing_validation",
  severity: "high",                                 // blocker | high | medium | low | info
  frequency: 3,                                     // bumped on every re-sighting
  status: "active",                                 // active | resolved | archived
  project_type: ["generic"],
  bug_source: {
    iteration_id: "iter_abc",
    agent: "executor",
    source: "iteration_event",
    related_files: ["app.js"]
  },
  trigger_condition: "Executor returned changed_files but no commands_run and no unable_to_verify_reason.",
  human_flow: [
    { step: 1, actor: "user", action: "requests a change" },
    { step: 2, actor: "supervisor", action: "plans + assigns" },
    { step: 3, actor: "executor", action: "applies change" },
    { step: 4, actor: "executor", action: "must run a verification command" },
    { step: 5, actor: "supervisor", action: "checks evidence before marking complete" }
  ],
  expected_behavior: "...",
  actual_failure: "...",
  regression_assertions: [
    "if changed_files is non-empty then commands_run must be non-empty",
    "if commands_run is empty then unable_to_verify_reason must be set",
    "supervisor must not accept completed without verification_evidence"
  ],
  reproduction_steps: ["...", "...", "..."],
  suggested_test_type: "workflow_regression",
  fingerprint: "missing_validation_after_code_change",  // stable across runs
  created_at: ISOString,
  updated_at: ISOString,
  last_seen_at: ISOString,
  related_files: []
}
```

## Bug fingerprint

The fingerprint is a short, category-level string that does NOT include
timestamps, ids, or full paths. Examples:

- `missing_validation_after_code_change`
- `supervisor_accepts_unverified_result`
- `repeated_failure_without_root_cause:pnpm test`
- `unsafe_command_detected`

This is the join key between QACases, MemoryAgent counts, and the
WorkflowAssertions that police regressions.

## Dedup strategy

- `QADeduplicator.dedupeCases()` merges by fingerprint in-memory.
- `QACaseStore.upsert()` merges by fingerprint on disk: keeps the earliest
  `id` + `created_at`, bumps `frequency`, refreshes `last_seen_at`.
- MemoryAgent maintains an in-process counter and is consulted to bump
  frequency at upsert time — so cross-iteration recurrence is reflected.

## Regression spec

Path: `<systemRoot>/qa/specs/qa-regression.spec.json`.

```json
{
  "version": "1",
  "updated_at": "...",
  "assertions": [
    "missing_validation_after_code_change",
    "supervisor_accepts_unverified_result",
    "repeated_failure_without_root_cause",
    "test_file_created_but_not_runnable",
    "docs_claim_without_evidence",
    "unsafe_command_detected",
    "regression_spec_not_updated_after_failure"
  ],
  "cases": [ ...QACase ]
}
```

The `assertions` list is the rule library (implemented in
`src/qa/workflowAssertions.ts`). The `cases` array accumulates known
failures so they survive across runs and projects.

## Human flow regression

We do not just unit-test functions — every QACase declares a `human_flow`
(actor + action per step). The Supervisor's actual loop mirrors the canonical
flow, so when the regression runner replays it, mismatches surface as
assertion failures. To extend a flow, add a new detector in
`QACaseGenerator.ts` AND the matching assertion in `workflowAssertions.ts`.

## Preflight

Before each iteration, the QA Agent loads the persisted cases and emits a
`note` event listing all active fingerprints. This is currently informational
— Phase 3 will expand preflight into an active gating step.
