#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AnalyzerAgent } from '../dist/agents/AnalyzerAgent.js';
import { RuleBasedExecutor } from '../dist/agents/providers/RuleBasedExecutor.js';
import { PlannerAgent } from '../dist/agents/PlannerAgent.js';
import { SupervisorAgent } from '../dist/agents/SupervisorAgent.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const manifestPath = path.join(here, 'stress-fixtures', 'manifest.json');
const reportDir = path.join(here, 'reports');
const productizedDir = path.join(here, 'productized');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const args = parseArgs(process.argv.slice(2));
const productize = args.productize === true;
const requireProductReady = args.requireProductReady === true;
const selectedFixtures = args.fixtures.length > 0 ? new Set(args.fixtures) : null;

const analyzer = new AnalyzerAgent();
const planner = new PlannerAgent();
const results = [];

for (const fixture of manifest) {
  if (selectedFixtures && !selectedFixtures.has(fixture.id)) continue;
  const projectPath = path.join(here, 'stress-fixtures', fixture.id);
  if (!existsSync(projectPath)) {
    results.push({
      id: fixture.id,
      name: fixture.name,
      ok: false,
      missing_fixture: true,
      missing_expected_findings: fixture.expected_findings,
    });
    continue;
  }

  const { snapshot, score, gap } = await analyzer.fullAnalyze(projectPath);
  const plan = planner.plan(gap, `pressure-test productization for ${fixture.name}`);
  const categories = gap.findings.map((finding) => finding.category);
  const planTitles = plan.tasks.map((task) => task.title);
  const missingExpected = fixture.expected_findings.filter((category) => !categories.includes(category));
  const missingExpectedPlanTitles = (fixture.expected_plan_titles ?? []).filter((title) => !planTitles.includes(title));
  const baseResult = {
    id: fixture.id,
    name: fixture.name,
    project_path: path.relative(root, projectPath),
    language: snapshot.detected_language,
    frameworks: snapshot.detected_frameworks,
    before_score: score.total,
    before_grade: score.grade,
    before_finding_count: gap.findings.length,
    before_blocker_count: gap.blockers.length,
    findings: categories,
    expected_findings: fixture.expected_findings,
    missing_expected_findings: missingExpected,
    expected_plan_titles: fixture.expected_plan_titles ?? [],
    missing_expected_plan_titles: missingExpectedPlanTitles,
    planned_tasks: plan.tasks.map((task) => ({
      title: task.title,
      verification_commands: task.verification_commands,
      expected_changed_files: task.expected_changed_files,
    })),
  };

  if (productize) {
    const productPath = path.join(productizedDir, fixture.id);
    rmSync(productPath, { recursive: true, force: true });
    mkdirSync(path.dirname(productPath), { recursive: true });
    cpSync(projectPath, productPath, {
      recursive: true,
      filter: (source) => !/(^|\/)\.DS_Store$/.test(source),
    });
    const summaries = await new SupervisorAgent().iterate({
      projectPath: productPath,
      goal: `turn ${fixture.name} into a product-ready baseline`,
      provider: new RuleBasedExecutor(),
      maxIterations: args.iterations,
    });
    const after = await analyzer.fullAnalyzeWithEvidence(productPath, { runCommands: true, timeoutMs: 60_000 });
    const afterCategories = after.gap.findings.map((finding) => finding.category);
    const missingProductFiles = (fixture.expected_product_files ?? []).filter((file) => !existsSync(path.join(productPath, file)));
    const unresolvedExpectedFindings = fixture.expected_findings.filter((category) => afterCategories.includes(category));
    const scoreDelta = after.score.total - score.total;
    const fullProductReady = after.score.grade === 'production_ready_baseline' && after.gap.findings.length === 0 && after.gap.blockers.length === 0;
    const productizationOk =
      missingExpected.length === 0 &&
      missingExpectedPlanTitles.length === 0 &&
      missingProductFiles.length === 0 &&
      unresolvedExpectedFindings.length === 0 &&
      after.gap.blockers.length === 0 &&
      scoreDelta > 0;

    results.push({
      ...baseResult,
      ok: requireProductReady ? productizationOk && fullProductReady : productizationOk,
      baseline_ok: productizationOk,
      productized: true,
      productized_path: path.relative(root, productPath),
      iterations: summaries.length,
      after_score: after.score.total,
      after_grade: after.score.grade,
      score_delta: scoreDelta,
      after_finding_count: after.gap.findings.length,
      after_blocker_count: after.gap.blockers.length,
      after_findings: afterCategories,
      full_product_ready: fullProductReady,
      expected_product_files: fixture.expected_product_files ?? [],
      missing_product_files: missingProductFiles,
      unresolved_expected_findings: unresolvedExpectedFindings,
      iteration_summaries: summaries.map((summary) => ({
        iteration_id: summary.iteration_id,
        before: summary.project_score_before.total,
        after: summary.project_score_after.total,
        assigned_tasks: summary.assigned_tasks.map((task) => task.title),
      })),
    });
    continue;
  }

  results.push({
    ...baseResult,
    ok: missingExpected.length === 0 && missingExpectedPlanTitles.length === 0 && plan.tasks.length > 0,
    productized: false,
  });
}

const failures = results.filter((result) => !result.ok);
const baselinePassed = results.filter((result) => result.baseline_ok ?? result.ok).length;
const productReadyCount = results.filter((result) => result.full_product_ready).length;
const report = {
  generated_at: new Date().toISOString(),
  mode: productize ? 'productize' : 'plan-only',
  iterations: productize ? args.iterations : 0,
  require_product_ready: requireProductReady,
  fixture_count: results.length,
  passed: results.length - failures.length,
  baseline_passed: baselinePassed,
  product_ready: productReadyCount,
  failed: failures.length,
  results,
};

mkdirSync(reportDir, { recursive: true });
writeFileSync(path.join(reportDir, 'stress-report.json'), JSON.stringify(report, null, 2) + '\n');
writeFileSync(path.join(reportDir, 'stress-report.md'), renderMarkdown(report));

console.log(JSON.stringify({
  fixture_count: report.fixture_count,
  passed: report.passed,
  baseline_passed: report.baseline_passed,
  product_ready: report.product_ready,
  failed: report.failed,
  report_json: path.relative(root, path.join(reportDir, 'stress-report.json')),
  report_md: path.relative(root, path.join(reportDir, 'stress-report.md')),
}, null, 2));

if (failures.length > 0) {
  console.error(`Stress demo coverage failed for ${failures.length} fixture(s).`);
  for (const failure of failures) {
    const missing = [
      ...(failure.missing_expected_findings ?? []),
      ...(failure.missing_expected_plan_titles ?? []).map((title) => `plan:${title}`),
      ...(failure.missing_product_files ?? []).map((file) => `file:${file}`),
      ...(failure.unresolved_expected_findings ?? []).map((category) => `unresolved:${category}`),
      ...(requireProductReady && !failure.full_product_ready ? ['not_full_product_ready'] : []),
    ];
    console.error(`- ${failure.id}: missing ${missing.join(', ') || 'planned tasks'}`);
  }
  process.exit(1);
}

function parseArgs(argv) {
  const out = { productize: false, iterations: 6, fixtures: [], requireProductReady: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--productize') out.productize = true;
    else if (arg === '--plan-only') out.productize = false;
    else if (arg === '--require-product-ready') out.requireProductReady = true;
    else if (arg === '--iterations') out.iterations = Number(argv[++i] ?? out.iterations);
    else if (arg.startsWith('--iterations=')) out.iterations = Number(arg.split('=')[1] ?? out.iterations);
    else if (arg === '--fixtures') out.fixtures = String(argv[++i] ?? '').split(',').filter(Boolean);
    else if (arg.startsWith('--fixtures=')) out.fixtures = String(arg.split('=')[1] ?? '').split(',').filter(Boolean);
  }
  if (!Number.isFinite(out.iterations) || out.iterations < 1) out.iterations = 6;
  return out;
}

function renderMarkdown(report) {
  const lines = [
    '# MatrixOmnix Demo Stress Report',
    '',
    `Generated: ${report.generated_at}`,
    `Mode: ${report.mode}`,
    `Iterations: ${report.iterations}`,
    `Require product-ready: ${report.require_product_ready}`,
    '',
    `Fixtures: ${report.fixture_count}`,
    `Baseline passed: ${report.baseline_passed}`,
    `Product-ready passed: ${report.product_ready}`,
    `Command passed: ${report.passed}`,
    `Failed: ${report.failed}`,
    '',
    '| Fixture | Score | Findings | Planned first task | Productized | Baseline | Product ready | Status |',
    '|---|---:|---|---|---|---|---|---|',
  ];
  for (const result of report.results) {
    const firstTask = result.planned_tasks?.[0]?.title ?? 'none';
    const missing = [
      ...(result.missing_expected_findings ?? []),
      ...(result.missing_expected_plan_titles ?? []).map((title) => `plan:${title}`),
      ...(result.missing_product_files ?? []).map((file) => `file:${file}`),
      ...(result.unresolved_expected_findings ?? []).map((category) => `unresolved:${category}`),
      ...(report.require_product_ready && !result.full_product_ready ? ['not_full_product_ready'] : []),
    ];
    const score = result.productized
      ? `${result.before_score} -> ${result.after_score} (${result.score_delta >= 0 ? '+' : ''}${result.score_delta})`
      : String(result.before_score ?? 'n/a');
    const productized = result.productized ? `${result.productized_path}` : 'no';
    const productReady = result.productized ? String(result.full_product_ready) : 'not run';
    const baseline = result.productized ? String(result.baseline_ok) : String(result.ok);
    const status = result.ok ? 'ok' : `missing ${missing.join(', ') || 'planned tasks'}`;
    lines.push(`| ${result.id} | ${score} | ${(result.findings ?? []).join('<br>')} | ${firstTask} | ${productized} | ${baseline} | ${productReady} | ${status} |`);
  }
  lines.push('');
  if (report.mode === 'productize') {
    lines.push('## Residual Product Gaps');
    lines.push('');
    for (const result of report.results) {
      lines.push(`### ${result.id}`);
      lines.push('');
      lines.push(`- Productized path: \`${result.productized_path}\``);
      lines.push(`- After grade: \`${result.after_grade}\`, score: \`${result.after_score}\``);
      lines.push(`- Remaining findings: ${result.after_finding_count}`);
      const remaining = (result.after_findings ?? []).slice(0, 12);
      lines.push(`- First remaining categories: ${remaining.length > 0 ? remaining.map((item) => `\`${item}\``).join(', ') : 'none'}`);
      lines.push('');
    }
  }
  return lines.join('\n');
}
