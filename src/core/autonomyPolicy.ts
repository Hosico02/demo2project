import path from 'node:path';
import { readJsonSafe, writeJson } from '../utils/json.js';
import { ensureDir, readTextSafe } from '../utils/fs.js';

/**
 * AutonomyPolicy (Phase 6) — formalizes what Demo2Project may do without
 * a human in the loop, at six discrete levels of trust.
 *
 *   L0 read-only    — only scan/score/report; no writes.
 *   L1 analyze+report — produce gap/plan/preflight; no writes.
 *   L2 safe-patch  — touch low-risk files (README, .env.example, .gitignore,
 *                    smoke tests, CI yaml); MUST verify; auto-rollback on
 *                    failure.
 *   L3 code-patch  — touch source code; requires approval; worktree only;
 *                    full verification gate.
 *   L4 self-sandbox — modify Demo2Project itself, but ONLY inside a
 *                    worktree, never the forbidden_self_modifications list,
 *                    must pass pnpm test + pnpm build + benchmark.
 *   L5 long-run    — multi-iteration autonomous loop with budget +
 *                    regression monitor + auto-rollback + audit report.
 *
 * Anything not explicitly granted at the current level is denied. Higher
 * levels INCLUDE lower-level permissions unless explicitly forbidden.
 */

export type AutonomyLevel =
  | 'L0_READ_ONLY'
  | 'L1_ANALYZE_AND_REPORT'
  | 'L2_SAFE_PATCH_WITH_VERIFICATION'
  | 'L3_CODE_PATCH_WITH_APPROVAL'
  | 'L4_SELF_ITERATION_SANDBOX'
  | 'L5_RESTRICTED_AUTONOMOUS_LOOP';

export const AUTONOMY_LEVELS: AutonomyLevel[] = [
  'L0_READ_ONLY',
  'L1_ANALYZE_AND_REPORT',
  'L2_SAFE_PATCH_WITH_VERIFICATION',
  'L3_CODE_PATCH_WITH_APPROVAL',
  'L4_SELF_ITERATION_SANDBOX',
  'L5_RESTRICTED_AUTONOMOUS_LOOP',
];

export interface AutonomyPolicy {
  default_autonomy_level: AutonomyLevel;
  max_iterations: number;
  max_cost_usd: number;
  max_wall_time_ms: number;
  max_regressions_allowed: number;
  min_score_improvement_per_window: number;
  score_window_size: number;
  require_approval_for: string[];
  forbidden_self_modifications: string[];
  rollback_on_score_drop: boolean;
  rollback_on_regression: boolean;
  allow_self_iteration: boolean;
  allow_global_memory_update: boolean;
  allow_standard_update: boolean;
  require_human_review_for_global_changes: boolean;
}

export const DEFAULT_AUTONOMY_POLICY: AutonomyPolicy = {
  default_autonomy_level: 'L2_SAFE_PATCH_WITH_VERIFICATION',
  max_iterations: 10,
  max_cost_usd: 1.0,
  max_wall_time_ms: 30 * 60 * 1000,
  max_regressions_allowed: 1,
  min_score_improvement_per_window: 1,
  score_window_size: 3,
  require_approval_for: [
    'src/core/safety.ts',
    'src/core/redaction.ts',
    'src/core/approvalGate.ts',
    'src/core/autonomyPolicy.ts',
    'src/agents/ExecutorAgent.ts',
    'qa/specs/',
    'config/approval-policy.json',
    'config/autonomy-policy.json',
    'templates/claude/',
    '.github/workflows/',
    'package-lock.json',
    'pnpm-lock.yaml',
  ],
  forbidden_self_modifications: [
    'src/core/safety.ts',
    'src/core/redaction.ts',
    'src/core/approvalGate.ts',
    'src/core/autonomyPolicy.ts',
    'templates/claude/hooks/',
    'qa/specs/',
    'config/approval-policy.json',
    'config/autonomy-policy.json',
  ],
  rollback_on_score_drop: true,
  rollback_on_regression: true,
  allow_self_iteration: false,
  allow_global_memory_update: false,
  allow_standard_update: false,
  require_human_review_for_global_changes: true,
};

const POLICY_PATH = 'config/autonomy-policy.json';

export async function loadPolicy(systemRoot: string): Promise<AutonomyPolicy> {
  const p = path.join(systemRoot, POLICY_PATH);
  const raw = await readJsonSafe<AutonomyPolicy>(p);
  return raw ?? DEFAULT_AUTONOMY_POLICY;
}

export async function savePolicy(systemRoot: string, policy: AutonomyPolicy): Promise<string> {
  const p = path.join(systemRoot, POLICY_PATH);
  await ensureDir(path.dirname(p));
  await writeJson(p, policy);
  return p;
}

export async function setAutonomyLevel(
  systemRoot: string,
  level: AutonomyLevel,
): Promise<AutonomyPolicy> {
  if (!AUTONOMY_LEVELS.includes(level)) {
    throw new Error(`unknown autonomy level: ${level}`);
  }
  const current = await loadPolicy(systemRoot);
  const next: AutonomyPolicy = { ...current, default_autonomy_level: level };
  // Higher levels imply explicit opt-ins we never auto-enable.
  if (level === 'L4_SELF_ITERATION_SANDBOX') next.allow_self_iteration = true;
  await savePolicy(systemRoot, next);
  return next;
}

export interface PolicyExplanation {
  level: AutonomyLevel;
  permissions: string[];
  prohibitions: string[];
  budget: { max_iterations: number; max_cost_usd: number; max_wall_time_ms: number };
  rollback_rules: string[];
  approval_paths: string[];
}

const LEVEL_PERMS: Record<AutonomyLevel, string[]> = {
  L0_READ_ONLY: ['scan', 'score', 'report', 'archetype detect'],
  L1_ANALYZE_AND_REPORT: ['L0', 'gap report', 'iteration plan', 'qa preflight'],
  L2_SAFE_PATCH_WITH_VERIFICATION: ['L1', 'write README/.env.example/.gitignore/CI/smoke tests', 'mandatory verification', 'auto-rollback on failure'],
  L3_CODE_PATCH_WITH_APPROVAL: ['L2', 'modify source code (with approval)', 'worktree required'],
  L4_SELF_ITERATION_SANDBOX: ['L3', 'modify Demo2Project itself in worktree', 'must pass full test + build + benchmark'],
  L5_RESTRICTED_AUTONOMOUS_LOOP: ['L4', 'multi-iteration loop with budget, regression monitor, audit report'],
};

const LEVEL_PROHIBITIONS: Record<AutonomyLevel, string[]> = {
  L0_READ_ONLY: ['any write'],
  L1_ANALYZE_AND_REPORT: ['any write'],
  L2_SAFE_PATCH_WITH_VERIFICATION: ['source code edits', 'package manager mutations', 'safety policy changes'],
  L3_CODE_PATCH_WITH_APPROVAL: ['safety policy changes', 'autonomy policy changes', 'QA spec changes'],
  L4_SELF_ITERATION_SANDBOX: ['changes to forbidden_self_modifications paths', 'merge to main without approval'],
  L5_RESTRICTED_AUTONOMOUS_LOOP: ['exceed budget', 'continue past regression threshold', 'skip rollback on score drop'],
};

export async function explain(systemRoot: string, levelOverride?: AutonomyLevel): Promise<PolicyExplanation> {
  const p = await loadPolicy(systemRoot);
  const level = levelOverride ?? p.default_autonomy_level;
  return {
    level,
    permissions: LEVEL_PERMS[level],
    prohibitions: LEVEL_PROHIBITIONS[level],
    budget: { max_iterations: p.max_iterations, max_cost_usd: p.max_cost_usd, max_wall_time_ms: p.max_wall_time_ms },
    rollback_rules: [
      p.rollback_on_score_drop ? 'rollback_on_score_drop=true' : 'rollback_on_score_drop=false',
      p.rollback_on_regression ? 'rollback_on_regression=true' : 'rollback_on_regression=false',
    ],
    approval_paths: p.require_approval_for,
  };
}

/** Returns true if path P is in the forbidden self-modification list. */
export function isForbiddenSelfMod(p: AutonomyPolicy, relPath: string): boolean {
  return p.forbidden_self_modifications.some((f) => relPath === f || relPath.startsWith(f));
}

/** Returns true if path P requires approval before write. */
export function requiresApproval(p: AutonomyPolicy, relPath: string): boolean {
  return p.require_approval_for.some((f) => relPath === f || relPath.startsWith(f));
}

export async function ensurePolicyFile(systemRoot: string): Promise<string> {
  const p = path.join(systemRoot, POLICY_PATH);
  const existing = await readTextSafe(p);
  if (existing) return p;
  await savePolicy(systemRoot, DEFAULT_AUTONOMY_POLICY);
  return p;
}
