import { describe, it, expect } from 'vitest';
import { render } from '../../src/product/reports/ReportRenderer.js';
import type { ReportDocument } from '../../src/product/reports/ReportTemplate.js';

const doc: ReportDocument = {
  schema_version: '0.0.8',
  type: 'project-report',
  title: 'Test',
  generated_at: '2026-01-01T00:00:00Z',
  summary: 'A summary.',
  findings: [{ id: 'f1', title: 'finding', severity: 'high', description: 'oops' }],
  evidence_summary: ['evid'],
  risk_summary: [{ level: 'high', label: 'r' }],
  recommendations: ['rec'],
  next_steps: ['step'],
  limitations: ['lim'],
  raw_refs: [],
};

describe('Report renderers', () => {
  it('markdown renders title + summary + findings', () => {
    const md = render(doc, 'markdown');
    expect(md).toContain('# Test');
    expect(md).toContain('A summary');
    expect(md).toContain('finding');
  });
  it('json renders to valid JSON', () => {
    const j = render(doc, 'json');
    expect(() => JSON.parse(j)).not.toThrow();
  });
  it('html includes findings details', () => {
    const h = render(doc, 'html');
    expect(h).toContain('<html');
    expect(h).toContain('finding');
  });
});
