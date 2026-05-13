/**
 * Secret redactor — thin wrapper over core/redaction.ts that adds awareness
 * of SecretFinding lines and lets callers redact a structured artifact
 * (events, evidence, replay bundle).
 */
import { redact, summarizeOutput } from '../../core/redaction.js';

export function redactString(s: string): string {
  return redact(s);
}

export function redactObject<T>(o: T): T {
  return JSON.parse(redact(JSON.stringify(o))) as T;
}

export function redactSummarized(s: string, maxLines = 40, maxChars = 4000): string {
  return summarizeOutput(s, maxLines, maxChars);
}
