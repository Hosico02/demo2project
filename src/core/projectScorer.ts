import path from 'node:path';
import type {
  ProjectSnapshot,
  ProjectScore,
  ScoreBreakdown,
  ProjectGrade,
  ProjectStandard,
} from './types.js';
import { listFiles, readTextSafe } from '../utils/fs.js';
import { DEFAULT_PROJECT_STANDARD } from '../standards/defaultProjectStandard.js';

function grade(total: number): ProjectGrade {
  if (total <= 30) return 'raw_demo';
  if (total <= 50) return 'working_demo';
  if (total <= 70) return 'structured_prototype';
  if (total <= 85) return 'project_ready_candidate';
  return 'production_ready_baseline';
}

/**
 * Score a snapshot against a ProjectStandard. Pure-ish — only re-reads a few
 * files to inspect content (README length, presence of test files), but does
 * not run any commands.
 */
export async function scoreProject(
  snapshot: ProjectSnapshot,
  standard: ProjectStandard = DEFAULT_PROJECT_STANDARD,
): Promise<ProjectScore> {
  const root = snapshot.project_path;
  const files = await listFiles(root);
  const has = (rel: string): boolean =>
    files.includes(rel) || files.some((f) => f.startsWith(rel + '/'));
  const notes: string[] = [];

  // --- structure ---
  const structureSignals = ['src', 'tests', 'docs', 'scripts'];
  const hits = structureSignals.filter(has).length;
  const structureScore = Math.min(10, hits * 3) + (has('.gitignore') ? 1 : 0);

  // --- tests ---
  let testScore = 0;
  if (snapshot.test_commands.length > 0) testScore += 6;
  if (files.some((f) => /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f))) testScore += 5;
  if (files.some((f) => /(^|\/)tests?\//.test(f))) testScore += 4;
  if (files.some((f) => /regression/.test(f))) testScore += 3;
  testScore = Math.min(18, testScore);

  // --- build ---
  let buildScore = 0;
  if (snapshot.build_commands.length > 0) buildScore += 8;
  if (has('tsconfig.json')) buildScore += 2;
  if (has('Dockerfile')) buildScore += 2;
  buildScore = Math.min(12, buildScore);

  // --- runtime ---
  let runtimeScore = 0;
  if (snapshot.start_commands.length > 0) runtimeScore += 6;
  if (has('src') || files.some((f) => /\.(ts|js|py|go)$/.test(f))) runtimeScore += 2;
  if (snapshot.dependency_summary.has_lockfile) runtimeScore += 2;
  runtimeScore = Math.min(10, runtimeScore);

  // --- docs ---
  let docsScore = 0;
  const readme = await readTextSafe(path.join(root, 'README.md'));
  if (readme && readme.trim().length > 0) {
    docsScore += 5;
    if (readme.length > 400) docsScore += 2;
    if (/## (Usage|Getting Started|Install)/i.test(readme)) docsScore += 2;
  }
  if (has('docs')) docsScore += 1;
  docsScore = Math.min(10, docsScore);

  // --- config ---
  let configScore = 0;
  if (has('.env.example')) configScore += 4;
  if (has('config') || has('tsconfig.json') || has('pyproject.toml')) configScore += 2;
  if (has('.gitignore')) configScore += 2;
  configScore = Math.min(8, configScore);

  // --- maintainability (very simple heuristic) ---
  let maintainabilityScore = 4; // baseline
  const big = files.filter((f) => /\.(ts|js|py)$/.test(f));
  if (big.length > 0) {
    let oversized = 0;
    for (const f of big.slice(0, 80)) {
      const txt = await readTextSafe(path.join(root, f));
      if (txt && txt.split('\n').length > 600) oversized++;
    }
    if (oversized === 0) maintainabilityScore += 4;
    else if (oversized <= 2) maintainabilityScore += 2;
    else notes.push(`${oversized} files exceed 600 lines (maintainability concern)`);
  }
  if (has('src')) maintainabilityScore += 2;
  maintainabilityScore = Math.min(10, maintainabilityScore);

  // --- safety ---
  let safetyScore = 4;
  const envFiles = files.filter((f) => /(^|\/)\.env(\.|$)/.test(f) && !f.endsWith('.example'));
  if (envFiles.length === 0) safetyScore += 2;
  else notes.push(`tracked .env files found: ${envFiles.join(', ')}`);
  // sample a few files for forbidden patterns
  const samplePool = files.filter((f) =>
    /\.(ts|js|py|json|md|yml|yaml|sh|env|toml)$/.test(f),
  );
  const sampled = samplePool.slice(0, 30);
  let leakFound = false;
  for (const f of sampled) {
    const txt = await readTextSafe(path.join(root, f));
    if (!txt) continue;
    for (const pat of standard.forbidden_patterns) {
      if (new RegExp(pat).test(txt)) {
        leakFound = true;
        notes.push(`forbidden pattern matched in ${f}`);
        break;
      }
    }
    if (leakFound) break;
  }
  if (!leakFound) safetyScore += 2;
  safetyScore = Math.min(8, safetyScore);

  // --- agent process ---
  let agentProcessScore = 0;
  if (has('qa')) agentProcessScore += 4;
  if (has('qa/specs') || files.includes('qa/specs/qa-regression.spec.json')) agentProcessScore += 4;
  if (has('docs/iteration-process.md') || files.includes('docs/iteration-process.md')) agentProcessScore += 3;
  if (has('src/agents')) agentProcessScore += 3;
  agentProcessScore = Math.min(14, agentProcessScore);

  const breakdown: ScoreBreakdown = {
    structure_score: structureScore,
    test_score: testScore,
    build_score: buildScore,
    runtime_score: runtimeScore,
    docs_score: docsScore,
    config_score: configScore,
    maintainability_score: maintainabilityScore,
    safety_score: safetyScore,
    agent_process_score: agentProcessScore,
  };

  const total = Math.min(
    100,
    Math.round(
      Object.values(breakdown).reduce((a, b) => a + b, 0),
    ),
  );

  return {
    total,
    grade: grade(total),
    breakdown,
    notes,
  };
}
