export type InjectionCategory =
  | 'ignore_previous_rules'
  | 'leak_secrets'
  | 'read_env'
  | 'execute_dangerous_command'
  | 'disable_verification'
  | 'modify_security_policy'
  | 'skip_approval'
  | 'exfil_system_prompt'
  | 'upload_logs'
  | 'install_unknown_mcp'
  | 'clear_qa_memory'
  | 'fabricate_verification'
  | 'mark_unverified_complete';

export interface PromptInjectionFinding {
  id: string;
  category: InjectionCategory;
  severity: 'low' | 'medium' | 'high' | 'critical';
  file: string;
  line: number;
  snippet: string;
  pattern_name: string;
  recommended_action: string;
}
