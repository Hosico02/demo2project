# Self-improvement engine

Hypothesis-experiment workflow. The system can:

1. **Diagnose** weaknesses via `self:diagnose` (uses scorer + QA memory health)
2. **Propose hypotheses** typed with rollback plans + `affected_modules`
3. **Run experiment** — v0.0.6 records the experiment + scope, **does not auto-mutate** the codebase
4. **Accept / reject / rollback** the experiment

Hypotheses that touch `forbidden_self_modifications` paths are
**auto-rejected at proposal time** (`status: 'rejected'`, `refused_reason`
set). Examples of paths that trigger refusal: `src/core/safety.ts`,
`src/core/redaction.ts`, `src/core/approvalGate.ts`,
`config/autonomy-policy.json`, `templates/claude/hooks/`, `qa/specs/`.

## CLI

```bash
demo2project self:diagnose
demo2project self:hypotheses
demo2project self:experiment --hypothesis <id>
demo2project self:accept --experiment <id>
demo2project self:reject --experiment <id>
demo2project self:rollback --experiment <id>
```

## Why "experiment doesn't mutate by default"

Two reasons:
1. **Worktree provenance**. Real mutation must happen in a fresh git
   worktree with full test + build + benchmark gates. That orchestration
   lives in `self-iterate-sandbox` (Phase 4) — when wired with this engine
   in a later phase, accepted experiments will trigger a worktree run.
2. **Bench coverage**. Self-improvement is the highest-risk autonomy
   surface. v0.0.6 ships the planning + safety surface first; mutating
   loop is Phase 7.
