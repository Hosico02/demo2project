export const CLAUDE_PROVIDER_GUIDE = `# Claude CLI as an Executor

Demo2Project does NOT replace Claude Code. Claude CLI is one of several
executors Demo2Project may delegate to. Demo2Project sits on top and decides:

  - Whether the task is allowed (SecurityPolicyEngine)
  - Whether the output is trustworthy (verification gate + confidence scorer)
  - Whether the change should be persisted (verification + approval workflow)
  - Whether to roll back (QualityTrendMonitor + RegressionBisector)

When Claude returns a result, Demo2Project:
  1. Parses the JSON. Failed parse → confidence=low.
  2. Validates that changed_files matches reality (snapshot diff).
  3. Runs the verification commands declared by the executor.
  4. If commands_run is empty and changed_files is non-empty, downgrades to failed.
  5. Records evidence in evidence/<iter>.json and audit/audit.log.

## Why not let Claude drive directly?

  - Claude has no persistent project memory across sessions.
  - Claude's natural language summary cannot be audited.
  - Claude has no rollback strategy.
  - Claude has no cross-project learning.

## Setup checklist

  1. Install Claude CLI: \`brew install --cask claude-code\` or follow vendor docs.
  2. \`pnpm demo2project claude:install-security-hooks --project <path>\`
  3. \`pnpm demo2project claude:generate-settings --project <path>\`
  4. \`pnpm demo2project claude:doctor --project <path>\`

## Limits

  - Real Claude calls are slow (~30-60s).
  - In the current prompt, Claude often returns confidence=low because it
    embeds structured JSON inside string fields. Tightening the executor
    prompt is a Phase 8.x carryover.
`;
