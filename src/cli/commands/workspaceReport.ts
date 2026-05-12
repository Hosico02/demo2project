import path from 'node:path';
import { ensureDir, writeText } from '../../utils/fs.js';
import { writeJson } from '../../utils/json.js';
import { runGeneralization } from '../../eval/generalization.js';
import { corpusList, corpusReport } from '../../eval/projectCorpus.js';
import { loadPatterns } from '../../eval/crossProjectLearning.js';
import { listSuggestions } from '../../eval/standardFeedback.js';
import { CostTracker } from '../../core/costTracker.js';

/**
 * report:workspace — bundles all Phase-5 aggregations into one folder of
 * markdown + json under reports/workspace/.
 */
export async function workspaceReport(_flags: Record<string, string | boolean>): Promise<number> {
  const systemRoot = path.resolve(new URL('../../..', import.meta.url).pathname);
  const dir = path.join(systemRoot, 'reports', 'workspace');
  await ensureDir(dir);

  const gen = await runGeneralization({ systemRoot });
  const corp = await corpusList({ systemRoot });
  const corpRep = await corpusReport({ systemRoot });
  const patterns = await loadPatterns(systemRoot);
  const suggestions = await listSuggestions(systemRoot);

  await writeJson(path.join(dir, 'generalization-report.json'), gen);
  await writeText(path.join(dir, 'generalization-report.md'), renderGeneralization(gen));
  await writeText(path.join(dir, 'qa-memory-report.md'), renderQAMemory(patterns));
  await writeText(path.join(dir, 'standard-feedback-report.md'), renderStandardFeedback(suggestions));
  await writeText(path.join(dir, 'executor-comparison-report.md'), renderExecutorComparison());
  process.stdout.write(JSON.stringify({
    dir,
    artifacts: [
      'generalization-report.json',
      'generalization-report.md',
      'qa-memory-report.md',
      'standard-feedback-report.md',
      'corpus-report.md',
      'executor-comparison-report.md',
    ],
    corpus_total: corp.length,
    patterns_total: patterns.length,
    suggestions_total: suggestions.length,
    corpus_report_path: corpRep.reportPath,
  }, null, 2) + '\n');
  return 0;
}

function renderGeneralization(r: Awaited<ReturnType<typeof runGeneralization>>): string {
  return [
    '# Generalization report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `- Total projects: **${r.total_projects}**`,
    `- Average score after: **${r.average_score_after}**`,
    `- docs_truth_failure_rate: ${(r.docs_truth_failure_rate * 100).toFixed(0)}%`,
    '',
    '## By archetype',
    '',
    ...Object.entries(r.projects_by_archetype).map(([a, n]) => `- ${a}: ${n} project(s); success_rate=${((r.success_rate_by_archetype[a] ?? 0) * 100).toFixed(0)}%`),
    '',
    '## Weakest archetypes',
    '',
    ...r.weakest_archetypes.map((a) => `- ${a}`),
    '',
  ].join('\n');
}
function renderQAMemory(patterns: { id: string; title: string; pattern_type: string; support_count: number; }[]): string {
  return [
    '# QA memory report',
    '',
    `Patterns: **${patterns.length}**`,
    '',
    '| id | type | support | title |',
    '|---|---|---|---|',
    ...patterns.map((p) => `| ${p.id} | ${p.pattern_type} | ${p.support_count} | ${p.title} |`),
    '',
  ].join('\n');
}
function renderStandardFeedback(s: { id: string; standard_id: string; reason: string; risk_level: string; }[]): string {
  return [
    '# Standard feedback report',
    '',
    `Suggestions: **${s.length}**`,
    '',
    '| id | standard | risk | reason |',
    '|---|---|---|---|',
    ...s.map((x) => `| ${x.id} | ${x.standard_id} | ${x.risk_level} | ${x.reason} |`),
    '',
  ].join('\n');
}
function renderExecutorComparison(): string {
  return [
    '# Executor comparison report',
    '',
    'See `compare-executors` CLI to populate this report with live data.',
    '',
    `Cost records: see \`cost:report --all --project <path>\` per project.`,
    '',
  ].join('\n');
}

// Mark unused imports as referenced for tree-shakers
void CostTracker;
