import type { ReportDocument } from './ReportTemplate.js';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const SEV_COLOR: Record<string, string> = {
  critical: '#b71c1c',
  high: '#e65100',
  medium: '#f9a825',
  low: '#558b2f',
  info: '#0277bd',
};

export function render(doc: ReportDocument): string {
  const findings = doc.findings.map((f) => `
<details><summary><span class="badge" style="background:${SEV_COLOR[f.severity] ?? '#888'}">${esc(f.severity)}</span> ${esc(f.title)}</summary>
<p>${esc(f.description)}</p>
${f.evidence ? `<pre>${esc(f.evidence)}</pre>` : ''}
</details>`).join('\n');
  const risks = doc.risk_summary.map((r) => `<li><span class="badge" style="background:${SEV_COLOR[r.level] ?? '#888'}">${esc(r.level)}</span> ${esc(r.label)}</li>`).join('');
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(doc.title)}</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:880px;margin:2rem auto;padding:0 1rem;color:#222}
h1,h2,h3{font-weight:600}
.meta{color:#666;font-size:0.9em}
.badge{display:inline-block;padding:2px 8px;color:#fff;border-radius:4px;font-size:0.85em;margin-right:4px}
ul{padding-left:1.2rem}
details{margin:0.4rem 0;padding:0.4rem 0.6rem;border-left:3px solid #ddd;background:#fafafa}
pre{background:#f3f3f3;padding:0.6rem;overflow:auto}
.summary{font-size:1.05em;background:#f4f7fb;padding:0.6rem 0.8rem;border-radius:6px}
</style></head><body>
<h1>${esc(doc.title)}</h1>
<p class="meta">Generated: ${esc(doc.generated_at)}${doc.project_path_hash ? ' · Project hash: ' + esc(doc.project_path_hash) : ''}</p>
<div class="summary">${esc(doc.summary)}</div>
${doc.risk_summary.length > 0 ? `<h2>Risk</h2><ul>${risks}</ul>` : ''}
${findings ? `<h2>Findings</h2>${findings}` : ''}
${doc.evidence_summary.length > 0 ? `<h2>Evidence</h2><ul>${doc.evidence_summary.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
${doc.recommendations.length > 0 ? `<h2>Recommendations</h2><ul>${doc.recommendations.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
${doc.next_steps.length > 0 ? `<h2>Next steps</h2><ul>${doc.next_steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
${doc.limitations.length > 0 ? `<h2>Limitations</h2><ul>${doc.limitations.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
</body></html>`;
}
