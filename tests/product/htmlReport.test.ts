import { describe, it, expect } from 'vitest';
import { render } from '../../src/product/reports/HtmlRenderer.js';
import type { ReportDocument } from '../../src/product/reports/ReportTemplate.js';

describe('HtmlRenderer', () => {
  it('escapes HTML in titles', () => {
    const doc: ReportDocument = {
      schema_version: '0.0.8', type: 'project-report', title: '<script>alert(1)</script>',
      generated_at: '', summary: 'ok', findings: [], evidence_summary: [], risk_summary: [],
      recommendations: [], next_steps: [], limitations: [], raw_refs: [],
    };
    const h = render(doc);
    expect(h).not.toContain('<script>alert(1)</script>');
    expect(h).toContain('&lt;script&gt;');
  });
});
