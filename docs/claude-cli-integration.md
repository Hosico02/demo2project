# Claude Code integration

Demo2Project does **not** call Claude directly by default. The recommended
integration is the other way around: you run `claude` on a project that has
Demo2Project's hooks installed, and the hooks enforce verification, safety,
and event recording from outside the prompt.

## Why hooks, not prompt instructions

Prompt instructions are advisory and routinely bypassed by long sessions,
plan changes, or the model deciding the rule "does not apply here." Hooks
are evaluated by Claude Code itself: a `PreToolUse` hook that returns exit
code 2 *will* block the tool call, full stop. Use hooks for invariants.
Use prompts for taste.

## Install

```bash
pnpm demo2project claude:install-hooks --project ./your-project
```

This writes:

- `<project>/.claude/settings.json` — registers our three hooks
- `<project>/.claude/hooks/pre-tool-use-safety.mjs`
- `<project>/.claude/hooks/post-tool-use-event-recorder.mjs`
- `<project>/.claude/hooks/stop-verification-gate.mjs`

If `.claude/settings.json` already exists, we **merge** our hook entries
into yours; we do not overwrite. Pass `--force` to overwrite outright.

## What each hook does

| Hook | Trigger | Effect |
|------|---------|--------|
| `pre-tool-use-safety.mjs` | `PreToolUse` for `Bash`/`Write`/`Edit`/`MultiEdit` | Blocks `rm -rf /`, `sudo`, `curl|sh`, shutdown, secret-shaped paths, and writes outside the project dir |
| `post-tool-use-event-recorder.mjs` | `PostToolUse` for the same tools | Appends a redacted record to `<project>/.demo2project/events/<session_id>.jsonl` |
| `stop-verification-gate.mjs` | `Stop` | Refuses to stop if files were changed but no verification command was observed and no `unable_to_verify_reason` is set |

## Disabling without uninstalling

Set the env var before running `claude`:

```bash
export DEMO2PROJECT_HOOKS_DISABLED=1
```

All three hooks check this and exit 0 immediately. The files stay in
place so you can re-enable by unsetting the variable.

## Viewing hook logs

The post-tool-use hook appends JSON Lines to:

```
<project>/.demo2project/events/<session_id>.jsonl
```

Pipe through `jq` to filter — every record is a single line of valid JSON.

## Common questions

**Will hooks slow Claude down?**
They are short Node scripts that read a few hundred bytes of JSON. Latency
is well under 50 ms.

**Can the model "see" the hook?**
No. Hooks run as separate subprocesses outside the model context. The model
sees only the tool result Claude Code returns.

**What if a hook is buggy?**
Hooks fail open (exit 0) when input JSON is unparseable. Pre-tool-use
hooks fail closed only on explicit rule matches. If you suspect interference,
set `DEMO2PROJECT_HOOKS_DISABLED=1` and re-run.

**Do these replace `src/core/safety.ts`?**
No — that's defense in depth. The in-code blocklist still applies when
Demo2Project itself spawns commands via `commandRunner`. The hooks cover
*all* tool calls Claude makes, including ones that bypass our executor.
