import type { ReportDocument } from './ReportTemplate.js';
import { render as renderMd } from './MarkdownRenderer.js';
import { render as renderJson } from './JsonRenderer.js';
import { render as renderHtml } from './HtmlRenderer.js';
import { redact } from '../../core/redaction.js';

export type ReportFormat = 'markdown' | 'json' | 'html';

export function render(doc: ReportDocument, format: ReportFormat = 'markdown', opts: { redact?: boolean } = {}): string {
  const out = format === 'json' ? renderJson(doc) : format === 'html' ? renderHtml(doc) : renderMd(doc);
  return opts.redact === false ? out : redact(out);
}
