/**
 * FailureTaxonomy (Phase 5) — a single shared classification for everything
 * the system records: QA cases, gap findings, evidence-graph claims,
 * learning patterns, evaluation reports.
 *
 * Why fixed enum? Cross-project learning needs stable join keys. Free-form
 * strings are unbearable at corpus scale.
 */

export type FailureCategory =
  // 1. verification_failure
  | 'verification_failure/test_failed'
  | 'verification_failure/build_failed'
  | 'verification_failure/lint_failed'
  | 'verification_failure/typecheck_failed'
  | 'verification_failure/smoke_test_failed'
  // 2. process_failure
  | 'process_failure/missing_validation_after_code_change'
  | 'process_failure/supervisor_accepted_unverified_result'
  | 'process_failure/repeated_failure_without_root_cause'
  | 'process_failure/task_completed_without_evidence'
  // 3. docs_failure
  | 'docs_failure/docs_claim_without_evidence'
  | 'docs_failure/readme_command_missing'
  | 'docs_failure/readme_command_not_runnable'
  | 'docs_failure/outdated_docs'
  // 4. test_quality_failure
  | 'test_quality_failure/empty_test'
  | 'test_quality_failure/assert_true_test'
  | 'test_quality_failure/test_not_discovered'
  | 'test_quality_failure/mock_everything'
  | 'test_quality_failure/brittle_test'
  | 'test_quality_failure/snapshot_only_test'
  // 5. project_structure_failure
  | 'project_structure_failure/missing_entrypoint'
  | 'project_structure_failure/unclear_module_boundary'
  | 'project_structure_failure/missing_config'
  | 'project_structure_failure/missing_env_example'
  | 'project_structure_failure/dependency_bloat'
  // 6. safety_failure
  | 'safety_failure/unsafe_command'
  | 'safety_failure/secret_leak'
  | 'safety_failure/dangerous_file_access'
  | 'safety_failure/insecure_default'
  // 7. executor_failure
  | 'executor_failure/output_unparseable'
  | 'executor_failure/claimed_without_evidence'
  | 'executor_failure/modified_unrelated_files'
  | 'executor_failure/overfit_to_prompt'
  // 8. scoring_failure
  | 'scoring_failure/score_gaming'
  | 'scoring_failure/false_quality_claim'
  | 'scoring_failure/unsupported_score_increase';

export const FAILURE_CATEGORIES: FailureCategory[] = [
  'verification_failure/test_failed',
  'verification_failure/build_failed',
  'verification_failure/lint_failed',
  'verification_failure/typecheck_failed',
  'verification_failure/smoke_test_failed',
  'process_failure/missing_validation_after_code_change',
  'process_failure/supervisor_accepted_unverified_result',
  'process_failure/repeated_failure_without_root_cause',
  'process_failure/task_completed_without_evidence',
  'docs_failure/docs_claim_without_evidence',
  'docs_failure/readme_command_missing',
  'docs_failure/readme_command_not_runnable',
  'docs_failure/outdated_docs',
  'test_quality_failure/empty_test',
  'test_quality_failure/assert_true_test',
  'test_quality_failure/test_not_discovered',
  'test_quality_failure/mock_everything',
  'test_quality_failure/brittle_test',
  'test_quality_failure/snapshot_only_test',
  'project_structure_failure/missing_entrypoint',
  'project_structure_failure/unclear_module_boundary',
  'project_structure_failure/missing_config',
  'project_structure_failure/missing_env_example',
  'project_structure_failure/dependency_bloat',
  'safety_failure/unsafe_command',
  'safety_failure/secret_leak',
  'safety_failure/dangerous_file_access',
  'safety_failure/insecure_default',
  'executor_failure/output_unparseable',
  'executor_failure/claimed_without_evidence',
  'executor_failure/modified_unrelated_files',
  'executor_failure/overfit_to_prompt',
  'scoring_failure/score_gaming',
  'scoring_failure/false_quality_claim',
  'scoring_failure/unsupported_score_increase',
];

const CATEGORY_DESCRIPTIONS: Record<FailureCategory, string> = {
  'verification_failure/test_failed': 'The configured test runner exited non-zero.',
  'verification_failure/build_failed': 'The build/compile step exited non-zero.',
  'verification_failure/lint_failed': 'The linter exited non-zero.',
  'verification_failure/typecheck_failed': 'Type checking surfaced new errors.',
  'verification_failure/smoke_test_failed': 'End-to-end smoke check failed.',
  'process_failure/missing_validation_after_code_change': 'Files changed but no verification command was run and no unable_to_verify_reason was set.',
  'process_failure/supervisor_accepted_unverified_result': 'Supervisor marked a task `completed` with empty verification_evidence.',
  'process_failure/repeated_failure_without_root_cause': 'Same command failed multiple times within one iteration without a documented root cause.',
  'process_failure/task_completed_without_evidence': 'A task transitioned to completed with no supporting evidence node.',
  'docs_failure/docs_claim_without_evidence': 'README cites a command/file/CI that does not exist.',
  'docs_failure/readme_command_missing': 'README mentions `npm test`/`pnpm build`/etc. with no matching script.',
  'docs_failure/readme_command_not_runnable': 'README command exists in scripts but fails to run.',
  'docs_failure/outdated_docs': 'Docs reference an old layout / API that no longer matches the code.',
  'test_quality_failure/empty_test': 'Test file present but empty/whitespace-only.',
  'test_quality_failure/assert_true_test': 'Test asserts a tautology (`expect(true).toBe(true)` etc.).',
  'test_quality_failure/test_not_discovered': 'Test files exist but the configured runner does not discover them.',
  'test_quality_failure/mock_everything': 'Test mocks the unit under test, leaving no behavior asserted.',
  'test_quality_failure/brittle_test': 'Test depends on environment/order/clock such that it flakes.',
  'test_quality_failure/snapshot_only_test': 'Test asserts only a snapshot with no semantic check.',
  'project_structure_failure/missing_entrypoint': 'No clear `main` / `bin` / app entry.',
  'project_structure_failure/unclear_module_boundary': 'Top-level files mix unrelated concerns.',
  'project_structure_failure/missing_config': 'No `tsconfig`/`pyproject`/equivalent for the detected stack.',
  'project_structure_failure/missing_env_example': 'Code reads env vars without a `.env.example` template.',
  'project_structure_failure/dependency_bloat': 'Many declared deps, few imported.',
  'safety_failure/unsafe_command': 'A dangerous shell command was attempted (rm -rf /, sudo, etc.).',
  'safety_failure/secret_leak': 'A secret-shaped string was found in source/log.',
  'safety_failure/dangerous_file_access': 'Write/read to a forbidden path (.env, ~/.ssh, …).',
  'safety_failure/insecure_default': 'Auth/CORS/permissive default that ships unsafely.',
  'executor_failure/output_unparseable': 'Provider returned output the adapter could not parse cleanly.',
  'executor_failure/claimed_without_evidence': 'Provider claimed changes that the filesystem did not show.',
  'executor_failure/modified_unrelated_files': 'Provider touched files outside the task scope.',
  'executor_failure/overfit_to_prompt': 'Provider memorized the prompt instead of the underlying issue.',
  'scoring_failure/score_gaming': 'Score increased due to placeholder files, not real improvement.',
  'scoring_failure/false_quality_claim': 'A quality dimension was marked verified without evidence.',
  'scoring_failure/unsupported_score_increase': 'Score grew faster than evidence justifies.',
};

export function explain(c: FailureCategory): string {
  return CATEGORY_DESCRIPTIONS[c];
}

export function listAll(): { category: FailureCategory; description: string }[] {
  return FAILURE_CATEGORIES.map((c) => ({ category: c, description: CATEGORY_DESCRIPTIONS[c] }));
}

/**
 * Best-effort categorization from free-form text. Returns the most specific
 * match, or null if nothing fits. Useful for legacy data ingestion.
 */
export function categorize(text: string): FailureCategory | null {
  const t = text.toLowerCase();
  for (const c of FAILURE_CATEGORIES) {
    const tail = c.split('/').pop()!;
    if (t.includes(tail)) return c;
  }
  if (/unable_to_verify_reason/.test(t)) return 'process_failure/missing_validation_after_code_change';
  if (/akia|sk-ant|sk-[a-z0-9]{20}|begin .* private key/i.test(t)) return 'safety_failure/secret_leak';
  if (/rm\s+-rf|sudo|fork bomb/.test(t)) return 'safety_failure/unsafe_command';
  if (/echo\s+ok|console\.log\("?build ok"?\)/.test(t)) return 'scoring_failure/score_gaming';
  return null;
}
