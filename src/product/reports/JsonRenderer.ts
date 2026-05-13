import type { ReportDocument } from './ReportTemplate.js';

export function render(doc: ReportDocument): string {
  return JSON.stringify(doc, null, 2);
}
