import type { ReportDocument } from './ReportTemplate.js';

export function render(doc: ReportDocument): string {
  const lines: string[] = [];
  lines.push(`# ${doc.title}`);
  lines.push('');
  lines.push(`Generated: ${doc.generated_at}`);
  if (doc.project_path_hash) lines.push(`Project: ${doc.project_path_hash}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(doc.summary);
  lines.push('');
  if (doc.risk_summary.length > 0) {
    lines.push('## Risk');
    for (const r of doc.risk_summary) lines.push(`- **${r.level.toUpperCase()}** — ${r.label}`);
    lines.push('');
  }
  if (doc.findings.length > 0) {
    lines.push('## Findings');
    for (const f of doc.findings) {
      lines.push(`### ${f.title} (${f.severity})`);
      lines.push(f.description);
      if (f.evidence) lines.push(`> evidence: ${f.evidence}`);
      lines.push('');
    }
  }
  if (doc.evidence_summary.length > 0) {
    lines.push('## Evidence');
    for (const e of doc.evidence_summary) lines.push(`- ${e}`);
    lines.push('');
  }
  if (doc.recommendations.length > 0) {
    lines.push('## Recommendations');
    for (const r of doc.recommendations) lines.push(`- ${r}`);
    lines.push('');
  }
  if (doc.next_steps.length > 0) {
    lines.push('## Next steps');
    for (const s of doc.next_steps) lines.push(`- ${s}`);
    lines.push('');
  }
  if (doc.limitations.length > 0) {
    lines.push('## Limitations');
    for (const l of doc.limitations) lines.push(`- ${l}`);
    lines.push('');
  }
  if (doc.raw_refs.length > 0) {
    lines.push('## Raw references');
    for (const r of doc.raw_refs) lines.push(`- ${r.name}: ${r.path}`);
  }
  return lines.join('\n') + '\n';
}
