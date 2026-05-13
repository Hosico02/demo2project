# Claude CLI setup

```bash
# 1. Install Claude CLI per vendor docs.

# 2. Install Demo2Project security hooks into your project.
pnpm demo2project claude:setup --project /path/to/your/repo

# 3. Verify.
pnpm demo2project claude:doctor --project /path/to/your/repo

# 4. Optional: regenerate settings if you change profile or repo trust level.
pnpm demo2project claude:generate-settings --project /path/to/your/repo
```

## What gets installed

- 3 baseline hooks: safety, event recorder, verification gate.
- 8 security hooks: policy, command guard, file guard, secret protection, audit recorder, evidence recorder, verification+policy gate, incident check.
- A `.claude/settings.json` that wires the hooks to PreToolUse / PostToolUse / Stop.

## What Claude CLI is — and isn't — in Demo2Project

Claude CLI is an **executor**. Demo2Project decides:

- whether the task is allowed (`SecurityPolicyEngine`),
- whether the output is trustworthy (verification gate, confidence scorer),
- whether to persist or roll back (`QualityTrendMonitor`, `RegressionBisector`).

When Claude returns a result, Demo2Project parses it, validates the diff against the snapshot, runs the verification commands, and **downgrades to failed** if changed_files is non-empty but commands_run is empty.

See `docs/guides/use-claude-cli-provider.md` for prompt template tuning.
