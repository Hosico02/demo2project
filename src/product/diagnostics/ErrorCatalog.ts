/**
 * Stable error code catalog (Phase 8).
 *
 * Every error Demo2Project emits to the user SHOULD have a code from this
 * catalog. Codes never change meaning across versions (additive only).
 */

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface CatalogEntry {
  code: string;
  title: string;
  human_readable_message: string;
  likely_causes: string[];
  recommended_actions: string[];
  related_docs: string[];
  related_commands: string[];
  risk_level: RiskLevel;
}

export const ERROR_CATALOG: CatalogEntry[] = [
  {
    code: 'D2P_CONFIG_MISSING',
    title: 'Demo2Project config not found',
    human_readable_message: 'No config file was found at `.demo2project/config.json` or `config/demo2project.json`. Defaults will be used.',
    likely_causes: ['fresh install', 'project not yet initialized'],
    recommended_actions: ['Run `pnpm demo2project init` to create a config'],
    related_docs: ['docs/getting-started/quickstart.md'],
    related_commands: ['init', 'config:show'],
    risk_level: 'low',
  },
  {
    code: 'D2P_POLICY_INVALID',
    title: 'Security policy fails validation',
    human_readable_message: 'The active security policy did not pass schema validation.',
    likely_causes: ['hand-edited config drifted from schema', 'policy migration not run'],
    recommended_actions: ['Run `pnpm demo2project policy:validate` to see errors', 'Run `pnpm demo2project config:migrate`'],
    related_docs: ['docs/security/overview.md'],
    related_commands: ['policy:validate', 'config:migrate'],
    risk_level: 'high',
  },
  {
    code: 'D2P_CLAUDE_HOOKS_NOT_INSTALLED',
    title: 'Claude security hooks are not installed',
    human_readable_message: 'Claude CLI cannot enforce Demo2Project policy at the tool boundary without these hooks.',
    likely_causes: ['fresh install', 'project never set up Claude integration'],
    recommended_actions: ['Run `pnpm demo2project claude:install-security-hooks --project <path>`'],
    related_docs: ['docs/guides/install-claude-hooks.md', 'docs/claude-security-hooks.md'],
    related_commands: ['claude:install-security-hooks', 'claude:hooks-status'],
    risk_level: 'medium',
  },
  {
    code: 'D2P_VERIFICATION_MISSING',
    title: 'Task changed files but no verification ran',
    human_readable_message: 'An iteration mutated files without producing verification evidence. The verification gate downgraded the task to failed.',
    likely_causes: ['executor returned changes but skipped verification', 'verification command crashed'],
    recommended_actions: ['Inspect events for the failing iteration', 'Re-run with a stricter prompt or rule-based provider'],
    related_docs: ['docs/concepts/verification-gate.md'],
    related_commands: ['evidence:show', 'qa:regression'],
    risk_level: 'medium',
  },
  {
    code: 'D2P_UNTRUSTED_REPO_BLOCKED',
    title: 'Action blocked: untrusted repository',
    human_readable_message: 'The target repository is in untrusted mode; the requested action is denied by default.',
    likely_causes: ['repo contains .env / postinstall / curl-pipe-to-shell', 'manual quarantine'],
    recommended_actions: ['Review the trust scan', 'Run `trust:check --project <path>`', 'If safe, elevate with `trust:set --level partially_trusted`'],
    related_docs: ['docs/security/untrusted-repos.md', 'docs/untrusted-repository-mode.md'],
    related_commands: ['trust:check', 'trust:set', 'repo:unquarantine'],
    risk_level: 'high',
  },
  {
    code: 'D2P_SECRET_DETECTED',
    title: 'Secret detected in scan',
    human_readable_message: 'A secret-like value was found in project files or persisted state.',
    likely_causes: ['committed .env', 'logs captured a token', 'CI artifact accidentally serialized credential'],
    recommended_actions: ['Rotate the credential', 'Remove from history', 'Run `secrets:scan` to find all instances'],
    related_docs: ['docs/security/secrets.md'],
    related_commands: ['secrets:scan', 'secrets:report'],
    risk_level: 'critical',
  },
  {
    code: 'D2P_APPROVAL_REQUIRED',
    title: 'Action requires approval',
    human_readable_message: 'The security policy or autonomy policy requires human approval for this action.',
    likely_causes: ['write to high-risk Demo2Project path', 'global memory update', 'self-iteration'],
    recommended_actions: ['Create approval request', 'Have an appropriate role approve via `approval:approve`'],
    related_docs: ['docs/security/approval-workflow.md'],
    related_commands: ['approval:list', 'approval:show', 'approval:approve'],
    risk_level: 'high',
  },
  {
    code: 'D2P_AUDIT_CHAIN_BROKEN',
    title: 'Audit log integrity broken',
    human_readable_message: 'The tamper-evident hash chain in `.demo2project/audit/audit.log` does not verify.',
    likely_causes: ['manual edit', 'truncation', 'partial write'],
    recommended_actions: ['Open an incident', 'Preserve current log for forensic review', 'Rotate sensitive credentials'],
    related_docs: ['docs/security/audit-log.md'],
    related_commands: ['audit:verify', 'incident:list'],
    risk_level: 'critical',
  },
  {
    code: 'D2P_QA_MEMORY_NOISY',
    title: 'QA memory has high noise score',
    human_readable_message: 'Accumulated QA cases include many duplicate or low-utility entries.',
    likely_causes: ['long-running session without compaction', 'false-positive flood'],
    recommended_actions: ['Run `qa:health` to inspect', 'Run `qa:compact --apply`'],
    related_docs: ['docs/concepts/qa-learning.md'],
    related_commands: ['qa:health', 'qa:compact'],
    risk_level: 'low',
  },
  {
    code: 'D2P_PROVIDER_PARSE_FAILED',
    title: 'Executor output could not be parsed',
    human_readable_message: 'The provider returned text that did not match the expected JSON schema. Confidence was downgraded.',
    likely_causes: ['model output is plain prose', 'JSON embedded in string field', 'tool truncation'],
    recommended_actions: ['Re-run with stricter prompt', 'Use rule-based provider for reproducibility'],
    related_docs: ['docs/guides/use-claude-cli-provider.md'],
    related_commands: ['provider:test', 'compare-executors'],
    risk_level: 'medium',
  },
  {
    code: 'D2P_WORKTREE_REQUIRED',
    title: 'Workspace branch / worktree required',
    human_readable_message: 'The current autonomy level requires changes to happen in a git worktree.',
    likely_causes: ['user ran in main', 'worktree manifest missing'],
    recommended_actions: ['Run inside a git repo with a clean branch', 'Lower autonomy level if you just want to scan'],
    related_docs: ['docs/concepts/autonomy-levels.md'],
    related_commands: ['rollback', 'rollback:stable'],
    risk_level: 'medium',
  },
  {
    code: 'D2P_SCORE_GAMING_DETECTED',
    title: 'Score gaming detected',
    human_readable_message: 'One of the anti-gaming detectors fired (empty test, echo build, sham CI, etc.).',
    likely_causes: ['executor produced placeholder artifacts', 'project has historical sham tests'],
    recommended_actions: ['Inspect findings', 'Re-run with rule-based executor or stricter prompt'],
    related_docs: ['docs/concepts/project-score.md'],
    related_commands: ['evidence:show', 'compare-executors'],
    risk_level: 'medium',
  },
];

export function findError(code: string): CatalogEntry | undefined {
  return ERROR_CATALOG.find((e) => e.code === code);
}
