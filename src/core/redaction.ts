/**
 * Best-effort redaction for log output, stdout/stderr, and anything that
 * might be persisted into events or QA spec files.
 *
 * The goal is to avoid leaking obvious secrets — not to be a perfect DLP.
 * Patterns target the most common shapes (env-style KEY=VALUE, JSON-style
 * "key": "value", bearer tokens, AWS keys, GitHub tokens, generic high-entropy).
 */

const SECRET_KEY_NAMES =
  '(api[_-]?key|secret|token|password|passwd|pwd|access[_-]?key|private[_-]?key|client[_-]?secret|auth|bearer|session[_-]?id|cookie|database[_-]?url|db[_-]?url|smtp[_-]?password)';

const PATTERNS: { pattern: RegExp; replace: string }[] = [
  // KEY=VALUE in env/shell style
  {
    pattern: new RegExp(`\\b${SECRET_KEY_NAMES}\\s*=\\s*([^\\s'"]+)`, 'gi'),
    replace: '$1=***REDACTED***',
  },
  // "key": "value" in JSON
  {
    pattern: new RegExp(`(\\"${SECRET_KEY_NAMES}\\"\\s*:\\s*\\")([^\\"]+)(\\")`, 'gi'),
    replace: '$1***REDACTED***$4',
  },
  // Authorization: Bearer xxxxx
  {
    pattern: /(authorization\s*:\s*bearer\s+)[A-Za-z0-9._\-+/=]+/gi,
    replace: '$1***REDACTED***',
  },
  // AWS access key id pattern
  { pattern: /\bAKIA[0-9A-Z]{16}\b/g, replace: '***REDACTED_AWS_KEY***' },
  // GitHub tokens (ghp_, gho_, ghu_, ghs_, ghr_)
  { pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, replace: '***REDACTED_GITHUB_TOKEN***' },
  // Anthropic-style sk-ant-...
  { pattern: /\bsk-ant-[A-Za-z0-9_\-]{20,}\b/g, replace: '***REDACTED_ANTHROPIC_KEY***' },
  // OpenAI-style sk-...
  { pattern: /\bsk-[A-Za-z0-9]{20,}\b/g, replace: '***REDACTED_OPENAI_KEY***' },
  // PEM private keys
  {
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replace: '***REDACTED_PRIVATE_KEY***',
  },
  // --- Phase 5: privacy-class patterns (paths / emails / etc.) ---
  // email addresses
  {
    pattern: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,
    replace: '***REDACTED_EMAIL***',
  },
  // absolute Unix-like local paths (project-specific home dirs).
  // \b does not match between two non-word chars (' ' and '/'), so use a
  // negative lookbehind for word chars instead.
  {
    pattern: /(?<![A-Za-z0-9_])\/Users\/[A-Za-z0-9_\-]+/g,
    replace: '/Users/***',
  },
  {
    pattern: /(?<![A-Za-z0-9_])\/home\/[A-Za-z0-9_\-]+/g,
    replace: '/home/***',
  },
  // IPv4 addresses
  {
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    replace: '***REDACTED_IP***',
  },
  // db URLs (postgres://user:pass@host/db, mongodb://, mysql://)
  {
    pattern: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s'"<>]+/gi,
    replace: '***REDACTED_DB_URL***',
  },
];

export function redact(text: string): string {
  let out = text;
  for (const { pattern, replace } of PATTERNS) {
    out = out.replace(pattern, replace);
  }
  return out;
}

/**
 * Summarize stdout/stderr: redact, then trim to maxLines + maxChars.
 */
export function summarizeOutput(text: string, maxLines = 40, maxChars = 4000): string {
  if (!text) return '';
  const redacted = redact(text);
  const lines = redacted.split('\n');
  let trimmed = lines.length > maxLines
    ? [...lines.slice(0, Math.floor(maxLines / 2)),
       `... [omitted ${lines.length - maxLines} lines] ...`,
       ...lines.slice(-Math.ceil(maxLines / 2))].join('\n')
    : redacted;
  if (trimmed.length > maxChars) {
    trimmed = trimmed.slice(0, maxChars) + `... [truncated, original ${redacted.length} chars]`;
  }
  return trimmed;
}
