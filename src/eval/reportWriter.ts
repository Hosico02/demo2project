import path from 'node:path';
import { ensureDir, writeText } from '../utils/fs.js';
import { writeJson } from '../utils/json.js';
import type { EvalComparison } from './evaluationRunner.js';

export async function writeEvaluationReport(
  systemRoot: string,
  rows: EvalComparison[],
): Promise<{ json: string; md: string }> {
  const dir = path.join(systemRoot, 'reports', 'evaluation');
  await ensureDir(dir);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(dir, `evaluation-report-${ts}.json`);
  const mdPath = path.join(dir, `evaluation-report-${ts}.md`);
  const latestJsonPath = path.join(dir, 'evaluation-report.json');
  const latestMdPath = path.join(dir, 'evaluation-report.md');
  await writeJson(jsonPath, { generated_at: new Date().toISOString(), rows });
  await writeJson(latestJsonPath, { generated_at: new Date().toISOString(), rows });
  const md = renderMarkdown(rows);
  await writeText(mdPath, md);
  await writeText(latestMdPath, md);
  return { json: latestJsonPath, md: latestMdPath };
}

function renderMarkdown(rows: EvalComparison[]): string {
  const lines: string[] = [];
  lines.push('# Demo2Project — A/B Evaluation Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  const wins = rows.filter((r) => r.recommendation === 'demo2project_wins').length;
  const ties = rows.filter((r) => r.recommendation === 'baseline_equivalent').length;
  const losses = rows.filter((r) => r.recommendation === 'inconclusive').length;
  lines.push(`- Cases evaluated: **${rows.length}**`);
  lines.push(`- demo2project wins: **${wins}**`);
  lines.push(`- baseline-equivalent: **${ties}**`);
  lines.push(`- inconclusive: **${losses}**`);
  const avgDelta = rows.length === 0 ? 0 : rows.reduce((a, r) => a + r.delta_score, 0) / rows.length;
  lines.push(`- average score Δ (demo2project − baseline): **${avgDelta.toFixed(1)}**`);
  lines.push('');
  lines.push('## Per-case comparison');
  lines.push('');
  lines.push('| case | standard | baseline (before→after) | demo2project (before→after) | Δ | baseline unverified | demo2project unverified | baseline docs lies | demo2project docs lies | qa cases | verdict |');
  lines.push('|------|----------|-------------------------|------------------------------|---|---------------------|--------------------------|---------------------|-------------------------|----------|---------|');
  for (const r of rows) {
    lines.push(
      `| ${r.case} | ${r.standard_selected} | ${r.baseline_score_before}→${r.baseline_score_after} (${r.baseline_grade_after}) | ${r.demo2project_score_before}→${r.demo2project_score_after} (${r.demo2project_grade_after}) | ${r.delta_score >= 0 ? '+' : ''}${r.delta_score} | ${r.baseline_unverified_changes} | ${r.demo2project_unverified_changes} | ${r.baseline_docs_false_claims} | ${r.demo2project_docs_false_claims} | ${r.qa_cases_created} | ${r.recommendation} |`,
    );
  }
  lines.push('');
  lines.push('## Interpretation');
  lines.push('');
  lines.push('A higher Δ means Demo2Project ended at a higher project-readiness score than a naive baseline path applying the same planner output without verification.');
  lines.push('');
  lines.push('The columns that matter most for the *control-layer* thesis are:');
  lines.push('');
  lines.push('- **unverified_changes**: count of file-change events without an accompanying verification command. Demo2Project should be 0; baseline should be > 0.');
  lines.push('- **docs_false_claims**: number of README commands that have no implementation. Demo2Project keeps this lower because RuleBasedExecutor produces concrete scripts; baseline writes overclaiming READMEs.');
  lines.push('- **qa cases**: how many failure-mode fingerprints the disciplined loop learned. Baseline = 0 (no learning).');
  lines.push('');
  return lines.join('\n');
}
