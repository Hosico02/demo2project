export type Capability =
  | 'read_project_files'
  | 'write_project_files'
  | 'delete_project_files'
  | 'run_safe_commands'
  | 'run_package_scripts'
  | 'install_dependencies'
  | 'access_network'
  | 'update_qa_memory'
  | 'update_workspace_memory'
  | 'update_global_memory'
  | 'update_project_standards'
  | 'modify_security_policy'
  | 'modify_verification_gate'
  | 'modify_hooks'
  | 'self_iterate'
  | 'export_reports'
  | 'create_replay_bundle';

export const ALL_CAPABILITIES: Capability[] = [
  'read_project_files', 'write_project_files', 'delete_project_files',
  'run_safe_commands', 'run_package_scripts', 'install_dependencies', 'access_network',
  'update_qa_memory', 'update_workspace_memory', 'update_global_memory', 'update_project_standards',
  'modify_security_policy', 'modify_verification_gate', 'modify_hooks',
  'self_iterate', 'export_reports', 'create_replay_bundle',
];

export const HIGH_RISK_CAPABILITIES: Capability[] = [
  'delete_project_files', 'install_dependencies', 'access_network',
  'update_global_memory', 'modify_security_policy', 'modify_verification_gate',
  'modify_hooks', 'self_iterate',
];

export interface CapabilityScopeSpec {
  project_path?: string;
  /** path prefixes that the capability applies to */
  path_prefixes?: string[];
  /** if true, scope extends to system root (Demo2Project itself) */
  system_scope?: boolean;
}

export function describe(cap: Capability): string {
  const M: Record<Capability, string> = {
    read_project_files: 'Read files within the project boundary.',
    write_project_files: 'Write files inside the project (subject to policy).',
    delete_project_files: 'Delete files (high risk).',
    run_safe_commands: 'Run commands that pass safety.ts FORBIDDEN list.',
    run_package_scripts: 'Invoke npm/pnpm/yarn scripts (no lifecycle by default).',
    install_dependencies: 'Add new dependencies (high risk, supply chain).',
    access_network: 'Make outbound network calls.',
    update_qa_memory: 'Write to repo-scope qa-cases.json.',
    update_workspace_memory: 'Write to workspace-scope QA memory.',
    update_global_memory: 'Write to global QA memory (high risk).',
    update_project_standards: 'Update project standard library.',
    modify_security_policy: 'Edit config/security-policy.json (critical).',
    modify_verification_gate: 'Alter the verification gate (immutable by default).',
    modify_hooks: 'Add or edit Claude CLI hooks.',
    self_iterate: 'Apply changes to Demo2Project itself.',
    export_reports: 'Write redacted reports to reports/.',
    create_replay_bundle: 'Build a redacted replay bundle.',
  };
  return M[cap];
}
