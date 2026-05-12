# Plugin & MCP security

This document is for users who run Claude Code (or any agent CLI) on top of
Demo2Project's loop. The goal is to keep the blast radius of a plugin or MCP
server bounded.

## Recommended posture

1. **Start with zero third-party plugins.** A vanilla Claude Code install
   plus Demo2Project's three hooks already covers the common failure modes:
   secret-leak, command danger, missing verification.
2. **Add plugins one at a time, with a justification.** "Convenience" is not
   a justification. "I need X capability that the base tool lacks" is.
3. **Read the plugin's source before installing.** Specifically: what
   filesystem paths it reads, what external network calls it makes, and
   what env vars it depends on. Plugins distributed as plain JavaScript /
   shell scripts are easier to audit than plugins that pull binaries.
4. **Pin versions.** Floating tags are a supply-chain liability.
5. **Run untrusted repos with `DEMO2PROJECT_HOOKS_DISABLED=0` explicitly
   set** and a permission mode of `plan` or `default` (not `bypassPermissions`).

## MCP servers — why we do not install them by default

MCP servers expand the action surface of the agent. Each new server is a new
trust boundary. Many published servers are useful, but: their tool surface,
permission model, and side-effects can vary widely, and bugs in one MCP
implementation can cascade through the agent's planning.

For projectization work specifically — what Demo2Project does — you almost
never need an MCP server. The control loop runs locally, the verifier runs
local commands, and the only "remote" actor is the AgentProvider you bind.

If you do install an MCP server:

- Prefer servers that scope themselves to a single repo or directory.
- Disable the ones you are not actively using; do not leave them connected.
- Treat any MCP server with file-system or shell-execution tools the same as
  you would treat installing a CLI utility globally.

## Hooks vs prompt: when to use which

| Need | Use |
|------|-----|
| Enforce an invariant ("never run sudo") | Hook |
| Prefer a coding style | Prompt |
| Block a class of mistakes | Hook |
| Suggest a style | Prompt |
| Record evidence for audit | Hook |
| Explain rationale to the model | Prompt |

Hooks are deterministic and the model cannot talk its way past them. Prompts
are flexible and the model can negotiate with them. Pick the right tool for
the job.

## Running Claude in an untrusted repo

If you must point Claude at a repo you do not control:

1. Make a fresh clone in a disposable directory.
2. Install Demo2Project hooks before the first `claude` invocation.
3. Set `DEMO2PROJECT_HOOKS_DISABLED=` (empty, not `1`).
4. Set permission mode to `plan` initially — the model can read but not
   write or execute.
5. Inspect `.demo2project/events/<session>.jsonl` after the session.
6. Throw away the clone when done.

This is overkill for trusted repos; it is the minimum for a repo you suspect.

## What "secrets" we redact

- `API_KEY` / `SECRET` / `TOKEN` / `PASSWORD` and variants in env-style
- `Authorization: Bearer …`
- AWS access key id (`AKIA…`)
- GitHub PAT (`ghp_…`, `gho_…`, …)
- Anthropic key shape (`sk-ant-…`)
- OpenAI key shape (`sk-…`)
- PEM private keys

Redaction happens in `src/core/redaction.ts` AND in the post-tool-use hook.
Both must be updated when new secret shapes appear.

## Reporting concerns

If you find a hook bypass, a redaction miss, or an MCP integration that
violates these expectations, open an issue with the smallest reproduction
you can produce. Do not paste real secrets into the issue.
