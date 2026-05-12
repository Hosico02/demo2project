# Real executor integration

Demo2Project does NOT generate code. Real executors (Claude Code, Codex, …)
plug in behind the `AgentProvider` interface.

## ClaudeCliProvider (v0.0.4)

Enable the real subprocess driver:

```bash
demo2project provider:test --provider claude-cli --enabled --timeout-ms 60000
demo2project iterate --project ./examples/bad-demo --provider claude-cli --use-worktree
```

### Contract

1. Provider builds a structured prompt from the `AgentTask`.
2. Subprocess invocation: `claude -p <prompt> --output-format json --permission-mode acceptEdits` with `cwd=project_path`, total wall-clock cap via `timeoutMs`.
3. **Before** the call we snapshot the project's filesystem fingerprint (mtime + size per file).
4. **After** the call we diff fingerprints to get the OBSERVED changed set, independently of what the model claims.
5. **Confidence scoring** compares model-reported `changed_files` against observed:
   - `high` — ≥80% overlap with observed
   - `medium` — ≥40% overlap
   - `low` — parser failed OR <40% overlap
6. **Low confidence → status downgraded.** A task that produced changes but earned `confidence=low` is marked `failed` with `unable_to_verify_reason: low_confidence_in_provider_output`. The Verifier still runs the task's verification commands so evidence accumulates.
7. Always passes through Verifier, Reviewer, QA Agent — the model's self-report is never the source of truth.

### Verified end-to-end (v0.0.4)

`provider:test --provider claude-cli --enabled` against a synthetic README task:

```
provider: claude-code
dry_run: false
task_status: failed
changed_files: ["README.md"]
commands_run: ["test -s README.md"]
unable_to_verify_reason: low_confidence_in_provider_output
summary: "[confidence=low] Added README.md scaffold..."
```

Real Claude wrote the file. Our verification ran. Our confidence scorer flagged the output ambiguity. The gate refused completion. That's the proof.

## Future providers

`CodexProvider`, `DevinProvider`, `OpenHandsProvider`, `AiderProvider` are placeholders; replacing them is a one-file change.
