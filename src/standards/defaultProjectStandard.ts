import type { ProjectStandard } from '../core/types.js';

/**
 * Baseline project-ready standard. Users can override this with a JSON file
 * at <project>/config/project-standard.json — but the in-code default is
 * what runs out of the box.
 */
export const DEFAULT_PROJECT_STANDARD: ProjectStandard = {
  required_files: ['README.md', 'package.json'],
  recommended_files: [
    '.gitignore',
    'tsconfig.json',
    'src',
    'tests',
    'docs',
    '.env.example',
  ],
  required_commands: ['test', 'build'],
  quality_gates: [
    { name: 'tests_pass', command: 'test', required: true, description: 'unit/integration tests must pass' },
    { name: 'build_succeeds', command: 'build', required: true, description: 'build/typecheck must succeed' },
    { name: 'lint_clean', command: 'lint', required: false, description: 'linting should be clean if configured' },
  ],
  scoring_rules: [
    { dimension: 'structure_score', weight: 10 },
    { dimension: 'test_score', weight: 18 },
    { dimension: 'build_score', weight: 12 },
    { dimension: 'runtime_score', weight: 10 },
    { dimension: 'docs_score', weight: 10 },
    { dimension: 'config_score', weight: 8 },
    { dimension: 'maintainability_score', weight: 10 },
    { dimension: 'safety_score', weight: 8 },
    { dimension: 'agent_process_score', weight: 14 },
  ],
  forbidden_patterns: [
    'AKIA[0-9A-Z]{16}',
    'sk-[A-Za-z0-9]{20,}',
    '-----BEGIN [A-Z ]*PRIVATE KEY-----',
  ],
  verification_policy: {
    require_evidence_when_files_changed: true,
    max_command_timeout_ms: 120_000,
    forbid_unverified_completion: true,
  },
};
