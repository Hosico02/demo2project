import { ERROR_CATALOG } from './ErrorCatalog.js';
import { redact } from '../../core/redaction.js';

export function summary(): { total: number; by_risk: Record<string, number>; codes: string[] } {
  const byRisk: Record<string, number> = {};
  for (const e of ERROR_CATALOG) byRisk[e.risk_level] = (byRisk[e.risk_level] ?? 0) + 1;
  return { total: ERROR_CATALOG.length, by_risk: byRisk, codes: ERROR_CATALOG.map((e) => e.code) };
}

export function explainLog(text: string): { matches: { code: string; line: number; snippet: string }[] } {
  const matches: { code: string; line: number; snippet: string }[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const e of ERROR_CATALOG) {
      if (line.includes(e.code)) {
        matches.push({ code: e.code, line: i + 1, snippet: redact(line.slice(0, 200)) });
      }
    }
  }
  return { matches };
}
