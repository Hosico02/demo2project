import { findError } from './ErrorCatalog.js';
import type { CatalogEntry } from './ErrorCatalog.js';

export interface Remediation {
  code: string;
  title: string;
  steps: string[];
  commands: string[];
  docs: string[];
  risk_level: string;
}

export function advise(code: string): Remediation | null {
  const e = findError(code);
  if (!e) return null;
  return {
    code: e.code,
    title: e.title,
    steps: e.recommended_actions,
    commands: e.related_commands,
    docs: e.related_docs,
    risk_level: e.risk_level,
  };
}

export function explainEntry(e: CatalogEntry): string {
  return `${e.code} — ${e.title}\n\n${e.human_readable_message}\n\nLikely causes:\n${e.likely_causes.map((c) => `  - ${c}`).join('\n')}\n\nRecommended actions:\n${e.recommended_actions.map((a) => `  - ${a}`).join('\n')}\n\nRelated commands: ${e.related_commands.join(', ')}\nRelated docs: ${e.related_docs.join(', ')}\n`;
}
