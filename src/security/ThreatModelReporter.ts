import path from 'node:path';
import { ensureDir, writeText } from '../utils/fs.js';
import { writeJson } from '../utils/json.js';
import type { ThreatModelSnapshot } from './ThreatModel.js';

export async function writeReport(systemRoot: string, snap: ThreatModelSnapshot): Promise<{ json: string; md: string }> {
  const dir = path.join(systemRoot, 'reports', 'security');
  await ensureDir(dir);
  const jsonPath = path.join(dir, 'threat-model.json');
  const mdPath = path.join(dir, 'threat-model.md');
  await writeJson(jsonPath, snap);
  await writeText(mdPath, toMarkdown(snap));
  return { json: jsonPath, md: mdPath };
}

export function toMarkdown(snap: ThreatModelSnapshot): string {
  const lines: string[] = [];
  lines.push('# Demo2Project Threat Model');
  lines.push('');
  lines.push(`Generated: ${snap.generated_at}`);
  lines.push('');
  lines.push(`- Total threats: ${snap.total_threats}`);
  lines.push(`- Mitigated: ${snap.mitigated}`);
  lines.push(`- Partially mitigated: ${snap.partially_mitigated}`);
  lines.push(`- Unmitigated: ${snap.unmitigated}`);
  lines.push(`- Trust readiness score: ${snap.aggregate.trust_readiness_score}/100`);
  lines.push(`- Aggregate residual: ${snap.aggregate.total_residual}`);
  lines.push('');
  lines.push('## Top residual risks');
  lines.push('');
  for (const r of snap.aggregate.top) {
    lines.push(`- ${r.id} — residual ${r.residual_score} (raw ${r.raw_score})`);
  }
  lines.push('');
  lines.push('## Threats by category');
  lines.push('');
  for (const [cat, score] of Object.entries(snap.aggregate.by_category).sort((a, b) => b[1] - a[1])) {
    lines.push(`- ${cat}: residual ${score}`);
  }
  lines.push('');
  lines.push('## Catalog');
  lines.push('');
  for (const t of snap.threats) {
    lines.push(`### ${t.id} — ${t.title}`);
    lines.push(`- Category: ${t.category}`);
    lines.push(`- Risk: ${t.risk_level} (likelihood ${t.likelihood}, impact ${t.impact})`);
    lines.push(`- Status: ${t.status}`);
    lines.push(`- Attack surface: ${t.attack_surface.join(', ')}`);
    lines.push(`- Affected components: ${t.affected_components.join(', ')}`);
    lines.push(`- Mitigations: ${t.mitigations.join('; ')}`);
    lines.push(`- Related policies: ${t.related_policies.join(', ') || '—'}`);
    lines.push(`- Related tests: ${t.related_tests.join(', ') || '—'}`);
    lines.push('');
  }
  return lines.join('\n') + '\n';
}
