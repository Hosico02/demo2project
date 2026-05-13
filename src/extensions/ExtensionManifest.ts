import crypto from 'node:crypto';

export type ExtensionType =
  | 'provider'
  | 'project_standard'
  | 'qa_assertion'
  | 'scorer_dimension'
  | 'report_renderer'
  | 'policy_rule'
  | 'archetype_detector'
  | 'command'
  | 'benchmark_case'
  | 'learning_pattern_detector';

export const EXTENSION_TYPES: ExtensionType[] = [
  'provider', 'project_standard', 'qa_assertion', 'scorer_dimension',
  'report_renderer', 'policy_rule', 'archetype_detector', 'command',
  'benchmark_case', 'learning_pattern_detector',
];

export type RequiredPermission =
  | 'read_project_files'
  | 'write_project_files'
  | 'run_commands'
  | 'network_access'
  | 'modify_security_policy'
  | 'add_policy_rule'
  | 'read_qa_memory'
  | 'write_qa_memory'
  | 'register_command';

export interface ExtensionManifest {
  name: string;
  version: string;
  author: string;
  type: ExtensionType;
  entry: string;
  permissions_required: RequiredPermission[];
  supported_demo2project_versions: string[];
  description: string;
  risk_level: 'low' | 'medium' | 'high';
  config_schema?: Record<string, unknown>;
  capabilities?: string[];
  integrity_hash?: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function validate(m: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!m || typeof m !== 'object') return { ok: false, errors: ['manifest is not an object'], warnings };
  const e = m as Partial<ExtensionManifest>;
  if (!e.name) errors.push('name missing');
  if (!e.version) errors.push('version missing');
  if (!e.author) errors.push('author missing');
  if (!e.type) errors.push('type missing');
  else if (!EXTENSION_TYPES.includes(e.type)) errors.push(`invalid type: ${e.type}`);
  if (!e.entry) errors.push('entry missing');
  if (!Array.isArray(e.permissions_required)) errors.push('permissions_required must be an array');
  if (!Array.isArray(e.supported_demo2project_versions)) errors.push('supported_demo2project_versions must be an array');
  if (!e.risk_level) errors.push('risk_level missing');
  else if (!['low', 'medium', 'high'].includes(e.risk_level)) errors.push(`invalid risk_level: ${e.risk_level}`);
  if (e.permissions_required?.includes('modify_security_policy')) warnings.push('extension requests modify_security_policy — requires approval');
  if (e.permissions_required?.includes('network_access')) warnings.push('extension requests network_access — review carefully');
  return { ok: errors.length === 0, errors, warnings };
}

export function computeIntegrityHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}
