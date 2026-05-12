/**
 * Safety policy: block obviously dangerous shell commands.
 *
 * This is not a sandbox — it is a defense-in-depth check we run before
 * spawning any child process on behalf of an agent. Commands authored by
 * humans (e.g. typed into the CLI) are NOT subject to these checks.
 */

const FORBIDDEN_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*\s+)?\/(\s|$)/, reason: 'rm targeting root filesystem' },
  { pattern: /\brm\s+-rf?\s+\/(\s|$)/, reason: 'rm -rf /' },
  { pattern: /\brm\s+-rf?\s+~(\s|$|\/)/, reason: 'rm -rf on home directory' },
  { pattern: /\bsudo\b/, reason: 'sudo escalation' },
  { pattern: /\bshutdown\b/, reason: 'shutdown' },
  { pattern: /\breboot\b/, reason: 'reboot' },
  { pattern: /\bmkfs(\.|\s)/, reason: 'filesystem format' },
  { pattern: /\bdd\s+[^|]*\bif=/, reason: 'dd if=' },
  { pattern: /(curl|wget)\b[^|]*\|\s*(sudo\s+)?(sh|bash|zsh)\b/, reason: 'piping remote script to shell' },
  { pattern: /:\(\)\s*\{\s*:\|:&\s*\}/, reason: 'fork bomb' },
  { pattern: /\b(chmod|chown)\s+-R?\s+777\s+\/(\s|$)/, reason: 'chmod 777 on root' },
  { pattern: />\s*\/dev\/sd[a-z]/, reason: 'writing to raw disk device' },
];

export interface SafetyCheck {
  allowed: boolean;
  reason?: string;
}

export function checkCommandSafety(command: string): SafetyCheck {
  const normalized = command.replace(/\s+/g, ' ').trim();
  if (!normalized) return { allowed: false, reason: 'empty command' };
  for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
    if (pattern.test(normalized)) {
      return { allowed: false, reason };
    }
  }
  return { allowed: true };
}

export const DANGEROUS_PATTERNS_FOR_TEST: { pattern: RegExp; reason: string }[] =
  FORBIDDEN_PATTERNS;
