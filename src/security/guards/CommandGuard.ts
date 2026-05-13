import { checkCommandSafety } from '../../core/safety.js';

const EXTENDED_PATTERNS: { re: RegExp; reason: string }[] = [
  { re: /\bchmod\s+-R?\s+777\b/, reason: 'chmod 777 (overly permissive)' },
  { re: /\bchown\s+-R\b/, reason: 'chown -R (broad ownership change)' },
  { re: /\bsu\s+-/, reason: 'su escalation' },
  { re: /\bnc(?:at)?\s+(-l\s+)?-?[ev]?\s*[a-z0-9.\-]+\s+\d+/, reason: 'netcat outbound/listen' },
  { re: /\bssh\s+[^@\s]+@/, reason: 'ssh remote login' },
  { re: /\bscp\s+\S+\s+[^@\s]+@/, reason: 'scp upload' },
  { re: /\brm\s+-rf?\s+\.git\b/, reason: 'rm .git' },
  { re: /\bdd\s+if=.+of=\/dev\/sd/, reason: 'dd to raw device' },
  { re: />\s*\/etc\//, reason: 'redirect to /etc' },
  { re: />\s*~\/\.ssh\//, reason: 'write to ~/.ssh' },
  { re: />\s*~\/\.aws\//, reason: 'write to ~/.aws' },
  { re: /\bcurl\s+[^|]*\s+[-\s]?o\s+\/tmp\/[^\s]+\s*;\s*(bash|sh)\s+\/tmp\//, reason: 'download then execute' },
  { re: /\benv\s+\|\s*(curl|wget|nc)/, reason: 'env piped to network tool' },
  { re: /\bcat\s+(.*\.env|.*credentials).*\|\s*(curl|wget|nc)/, reason: 'secret cat into network tool' },
];

export interface CommandCheck {
  allowed: boolean;
  reason: string;
  matched_rule?: string;
}

export function check(command: string): CommandCheck {
  const baseline = checkCommandSafety(command);
  if (!baseline.allowed) return { allowed: false, reason: baseline.reason ?? 'unsafe', matched_rule: 'safety.ts' };
  for (const p of EXTENDED_PATTERNS) {
    if (p.re.test(command)) return { allowed: false, reason: p.reason, matched_rule: 'CommandGuard.extended' };
  }
  return { allowed: true, reason: 'no match' };
}
