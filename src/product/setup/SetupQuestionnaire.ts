export type SetupAnswerKey = 'archetype' | 'profile' | 'install_claude_hooks' | 'install_security_hooks' | 'install_github_workflows' | 'privacy_mode';

export interface SetupQuestion {
  key: SetupAnswerKey;
  prompt: string;
  options: { value: string; label: string }[];
  default: string;
  why: string;
}

export const SETUP_QUESTIONS: SetupQuestion[] = [
  {
    key: 'profile',
    prompt: 'Which autonomy profile fits this project?',
    options: [
      { value: 'conservative', label: 'Conservative — read-only, untrusted-mode default' },
      { value: 'balanced', label: 'Balanced — safe patches with verification (recommended)' },
      { value: 'autonomous', label: 'Autonomous — long-run sessions; high-risk still gated' },
    ],
    default: 'balanced',
    why: 'Controls how much Demo2Project may change without explicit approval.',
  },
  {
    key: 'privacy_mode',
    prompt: 'How sensitive should persisted data be?',
    options: [
      { value: 'normal', label: 'Normal — summaries + redacted evidence (recommended)' },
      { value: 'private', label: 'Private — no abs paths, no repo identifiers' },
      { value: 'strict_private', label: 'Strict private — no source snippets, no command output' },
    ],
    default: 'normal',
    why: 'Limits what shows up in events, evidence, reports, replay bundles.',
  },
  {
    key: 'install_claude_hooks',
    prompt: 'Install baseline Claude CLI hooks (event recorder, safety)?',
    options: [
      { value: 'yes', label: 'Yes (recommended)' },
      { value: 'no', label: 'No' },
    ],
    default: 'yes',
    why: 'Hooks are defense in depth — they apply the same checks one layer closer to the model.',
  },
  {
    key: 'install_security_hooks',
    prompt: 'Install Phase 7 security hooks (policy, guards, audit, incident)?',
    options: [
      { value: 'yes', label: 'Yes (recommended)' },
      { value: 'no', label: 'No' },
    ],
    default: 'yes',
    why: 'Without security hooks, only Demo2Project orchestration enforces policy.',
  },
  {
    key: 'install_github_workflows',
    prompt: 'Install GitHub Actions workflows (preflight, regression, trust-report)?',
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No (recommended unless on GitHub)' },
    ],
    default: 'no',
    why: 'Adds read-only CI checks; safe by default (no production-branch writes).',
  },
];
