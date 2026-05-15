import path from 'node:path';
import { promises as fs } from 'node:fs';
import type {
  ProjectSnapshot,
  ProjectScore,
  ScoreBreakdown,
  ProjectGrade,
  ProjectStandard,
} from './types.js';
import { listFiles, readTextSafe } from '../utils/fs.js';
import { readJsonSafe } from '../utils/json.js';
import { DEFAULT_PROJECT_STANDARD } from '../standards/defaultProjectStandard.js';

export function gradeProjectScore(total: number): ProjectGrade {
  if (total <= 30) return 'raw_demo';
  if (total <= 50) return 'working_demo';
  if (total <= 70) return 'structured_prototype';
  if (total <= 85) return 'project_ready_candidate';
  return 'production_ready_baseline';
}

const DEFAULT_SCORE_MAX: ScoreBreakdown = Object.fromEntries(
  DEFAULT_PROJECT_STANDARD.scoring_rules.map((r) => [r.dimension, r.weight]),
) as unknown as ScoreBreakdown;

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
  const pkg = await readJsonSafe<{ scripts?: Record<string, string>; bin?: unknown }>(path.join(root, 'package.json'));
  const scripts = pkg?.scripts ?? {};

  // --- structure ---
  const structureSignals = ['src', 'tests', 'docs', 'scripts'];
  const hits = structureSignals.filter(has).length;
  const structureScore = Math.min(10, hits * 3 + (has('.gitignore') ? 1 : 0));

  // --- tests ---
  const testAssessment = await assessTests(root, files, snapshot, scripts, notes);
  let testScore = 0;
  if (testAssessment.hasMeaningfulCommand) testScore += 4;
  if (testAssessment.hasAssertionTest) testScore += 6;
  else if (testAssessment.hasSmokeTest) testScore += 3;
  if (testAssessment.hasSubstantiveTestFile) testScore += 2;
  if (testAssessment.hasRegressionTest || testAssessment.hasProductBehaviorTest) testScore += 3;
  testScore = Math.min(18, testScore);

  // --- build ---
  let buildScore = 0;
  if (hasMeaningfulBuildCommand(snapshot, scripts, notes)) buildScore += 8;
  if (has('tsconfig.json')) buildScore += 2;
  if (snapshot.detected_language === 'python' && has('pyproject.toml')) buildScore += 2;
  if (has('Dockerfile')) buildScore += 2;
  buildScore = Math.min(12, buildScore);

  // --- runtime ---
  let runtimeScore = 0;
  if (snapshot.start_commands.length > 0 || hasPackageBin(pkg)) runtimeScore += 6;
  if (has('src') || files.some((f) => /\.(ts|tsx|js|jsx|mjs|cjs|py|go)$/.test(f))) runtimeScore += 2;
  if (snapshot.dependency_summary.has_lockfile || hasNoRuntimeDependencies(snapshot)) runtimeScore += 2;
  runtimeScore = Math.min(10, runtimeScore);

  // --- docs ---
  const readme = await readTextSafe(path.join(root, 'README.md'));
  let docsScore = scoreReadmeContent(readme, notes);
  if (has('docs')) docsScore += 1;
  docsScore = Math.min(10, docsScore);

  // --- config ---
  let configScore = 0;
  if (await hasSubstantiveEnvExample(root, notes)) configScore += 4;
  if (has('config') || has('tsconfig.json') || has('pyproject.toml')) configScore += 2;
  if (has('.gitignore')) configScore += 2;
  configScore = Math.min(8, configScore);

  // --- maintainability (very simple heuristic) ---
  let maintainabilityScore = 4; // baseline
  const big = files.filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs|py)$/.test(f));
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
      if (matchesForbiddenPattern(txt, pat)) {
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
  const ciAssessment = await assessCi(root, files, notes);
  if (ciAssessment.hasTestVerification && testAssessment.hasMeaningfulCommand) agentProcessScore += 3;
  if (ciAssessment.hasBuildVerification && hasMeaningfulBuildCommand(snapshot, scripts, notes, false)) agentProcessScore += 2;
  if (
    ciAssessment.hasTestVerification &&
    ciAssessment.hasBuildVerification &&
    testAssessment.hasMeaningfulCommand &&
    hasMeaningfulBuildCommand(snapshot, scripts, notes, false)
  ) {
    agentProcessScore += 2;
  }
  if (hasProductCoreVerification(files, scripts)) agentProcessScore += 3;
  agentProcessScore += await scoreDemo2ProjectProcessState(root);
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

  const total = scoreTotalFromBreakdown(breakdown, standard);

  return {
    total,
    grade: gradeProjectScore(total),
    breakdown,
    notes,
  };
}

interface TestAssessment {
  hasMeaningfulCommand: boolean;
  hasAssertionTest: boolean;
  hasSmokeTest: boolean;
  hasSubstantiveTestFile: boolean;
  hasRegressionTest: boolean;
  hasProductBehaviorTest: boolean;
}

async function assessTests(
  root: string,
  files: string[],
  snapshot: ProjectSnapshot,
  scripts: Record<string, string>,
  notes: string[],
): Promise<TestAssessment> {
  const testFiles = files.filter(isTestFile);
  const texts = await Promise.all(testFiles.slice(0, 80).map((f) => readTextSafe(path.join(root, f))));
  const joined = texts.filter((t): t is string => !!t).join('\n');
  const hasAssertionTest = /\b(assert|expect|should|pytest\.raises|unittest|assertEquals?|assertEqual)\b|\.to(Be|Equal|Contain|Match|Throw|Have|BeTruthy|BeFalsy)\s*\(/.test(joined);
  const hasSmokeTest = /\b(test|it|describe)\s*\(|def\s+test_[a-zA-Z0-9_]+\s*\(/.test(joined);
  const hasSubstantiveTestFile = hasAssertionTest || hasSmokeTest;
  if (testFiles.length > 0 && !hasSubstantiveTestFile) {
    notes.push('test files appear placeholder; test_score limited until they contain executable test cases or assertions.');
  }

  const commandBody = scripts.test ?? snapshot.test_commands.join(' && ');
  const hasMeaningfulCommand = snapshot.test_commands.length > 0 && !isPlaceholderCommand(commandBody);
  if (snapshot.test_commands.length > 0 && !hasMeaningfulCommand) {
    notes.push('test command appears placeholder; test_score limited until it runs a real test runner.');
  }
  return {
    hasMeaningfulCommand,
    hasAssertionTest,
    hasSmokeTest,
    hasSubstantiveTestFile,
    hasRegressionTest: testFiles.some((f) => /regression/i.test(f)) && hasSubstantiveTestFile,
    hasProductBehaviorTest: testFiles.some((f) => /(product-core|contract|integration|e2e)/i.test(f)) && hasAssertionTest,
  };
}

function isTestFile(file: string): boolean {
  return /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file) ||
    /(^|\/)test_[^/]+\.py$/.test(file) ||
    /_test\.py$/.test(file);
}

function hasPackageBin(pkg: { bin?: unknown } | null | undefined): boolean {
  if (!pkg || pkg.bin === undefined || pkg.bin === null) return false;
  if (typeof pkg.bin === 'string') return pkg.bin.trim().length > 0;
  if (typeof pkg.bin === 'object') return Object.keys(pkg.bin as Record<string, unknown>).length > 0;
  return false;
}

function hasNoRuntimeDependencies(snapshot: ProjectSnapshot): boolean {
  return snapshot.dependency_summary.runtime === 0 && snapshot.dependency_summary.dev === 0;
}

function hasProductCoreVerification(files: string[], scripts: Record<string, string>): boolean {
  const scriptBlob = Object.values(scripts).join('\n');
  const hasCoreSource = files.some((file) => /^src\/product-core\.mjs$/.test(file) || /^src\/product_core\.py$/.test(file));
  const hasCoreTest = files.some((file) => /^tests\/product-core\.test\.mjs$/.test(file) || /^tests\/test_product_core\.py$/.test(file));
  const hasCoreDocs = files.includes('docs/product-core.md');
  const hasCoreScript = /\bproduct:core-check\b|product-core\.test|test_product_core/.test(scriptBlob);
  return hasCoreSource && hasCoreTest && hasCoreDocs && hasCoreScript;
}

function hasMeaningfulBuildCommand(
  snapshot: ProjectSnapshot,
  scripts: Record<string, string>,
  notes: string[],
  emitNote = true,
): boolean {
  if (snapshot.build_commands.length === 0) return false;
  const commandBody = scripts.build ?? snapshot.build_commands.join(' && ');
  const meaningful = !isPlaceholderCommand(commandBody);
  if (!meaningful && emitNote) {
    notes.push('build command appears placeholder; build_score limited until it validates source or artifacts.');
  }
  return meaningful;
}

function isPlaceholderCommand(command: string): boolean {
  const normalized = command.trim().toLowerCase();
  return normalized.length === 0 ||
    /^(echo|printf)\b/.test(normalized) ||
    /^(true|exit\s+0)$/.test(normalized) ||
    /\bnode\s+-e\s+["']?\s*console\.log\s*\(/.test(normalized) ||
    /\b(build ok|test ok|tests? pass(?:ed)?|ok)\b/.test(normalized) && !/\b(vitest|jest|mocha|pytest|node\s+--test|tsc|vite|next|nuxt|astro|webpack|rollup|eslint|ruff|mypy)\b/.test(normalized);
}

function matchesForbiddenPattern(text: string, pattern: string): boolean {
  if (/PRIVATE KEY/.test(pattern)) {
    return /^-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]{20,}^-----END [A-Z ]*PRIVATE KEY-----/m.test(text);
  }
  if (/^sk-|\\bsk-|\bsk-/.test(pattern)) {
    return Array.from(text.matchAll(/\bsk-[A-Za-z0-9][A-Za-z0-9_-]{19,}\b/g))
      .some((match) => !isDummySecretToken(match[0]));
  }
  try {
    return new RegExp(pattern).test(text);
  } catch {
    return false;
  }
}

function isDummySecretToken(token: string): boolean {
  const value = token.toLowerCase();
  return /\b(example|dummy|fake|test|placeholder)\b/.test(value) ||
    /1234567890/.test(value) ||
    /abcdefghij/.test(value) ||
    /[x_]{8,}/.test(value);
}

async function hasSubstantiveEnvExample(root: string, notes: string[]): Promise<boolean> {
  const text = await readTextSafe(path.join(root, '.env.example'));
  if (text === null) return false;
  const entries = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  const hasEntry = entries.some((line) => /^[A-Z][A-Z0-9_]{1,80}\s*=/.test(line));
  if (!hasEntry) notes.push('.env.example appears placeholder; config_score limited until it lists concrete environment variables.');
  return hasEntry;
}

interface CiAssessment {
  hasTestVerification: boolean;
  hasBuildVerification: boolean;
}

async function assessCi(root: string, files: string[], notes: string[]): Promise<CiAssessment> {
  const workflowFiles = files.filter((f) => /^\.github\/workflows\/[^/]+\.(ya?ml)$/.test(f));
  if (workflowFiles.length === 0) return { hasTestVerification: false, hasBuildVerification: false };
  const text = (await Promise.all(workflowFiles.map((f) => readTextSafe(path.join(root, f)))))
    .filter((t): t is string => !!t)
    .join('\n')
    .toLowerCase();
  const hasTestVerification = /\brun:\s*[^\n]*(npm|pnpm|yarn|bun)\s+(run\s+)?test\b|\brun:\s*[^\n]*(python3?\s+-m\s+pytest|pytest|vitest|jest|mocha|node\s+--test)\b/.test(text);
  const hasBuildVerification = /\brun:\s*[^\n]*(npm|pnpm|yarn|bun)\s+(run\s+)?build\b|\brun:\s*[^\n]*(tsc|vite\s+build|next\s+build|python3?\s+-m\s+compileall)\b/.test(text);
  if (!hasTestVerification && !hasBuildVerification) {
    notes.push('CI workflow appears empty or non-verifying; agent_process_score limited until it runs test or build commands.');
  }
  return { hasTestVerification, hasBuildVerification };
}

function scoreReadmeContent(readme: string | null, notes: string[]): number {
  if (!readme || readme.trim().length === 0) return 0;
  const text = readme.trim();
  const normalized = text.toLowerCase();
  if (isPlaceholderReadme(normalized) || text.length < 120) {
    notes.push('README appears placeholder or too thin; docs_score limited until purpose, setup and usage are documented.');
    return text.length >= 40 ? 2 : 1;
  }

  let score = 2;
  if (/^#\s+\S+/m.test(text)) score += 1;
  if (text.length >= 200) score += 1;
  if (text.length >= 400) score += 2;
  if (/##\s*(Usage|Getting Started|Install|Quick Start|快速开始|安装|使用|部署)/i.test(text)) score += 2;
  if (hasReadmeBodyContent(text)) score += 1;
  if (/(pnpm|npm|yarn|bun|pip|poetry|python|node|docker|curl|matrixomnix|demo2project)\s+[^\n]+/.test(text)) score += 1;
  if (/##\s*(Test|Tests|Verification|Development|Deploy|Deployment|配置|测试|验证|开发|部署)/i.test(text)) score += 1;
  return Math.min(9, score);
}

function hasReadmeBodyContent(text: string): boolean {
  const bodyLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !/^[-*_`>]+$/.test(line));
  return bodyLines.some((line) => line.length >= 12);
}

function isPlaceholderReadme(normalized: string): boolean {
  const body = normalized
    .replace(/^#.*$/gm, '')
    .replace(/[`*_>\-#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!body) return true;
  return /\b(todo|tbd|coming soon|lorem ipsum|placeholder|fixme|write me|under construction|to be written)\b/.test(body) ||
    /待补充|占位|稍后补充|建设中/.test(body);
}

export function scoreTotalFromBreakdown(
  breakdown: ScoreBreakdown,
  standard: ProjectStandard = DEFAULT_PROJECT_STANDARD,
): number {
  const rules = standard.scoring_rules.length > 0
    ? standard.scoring_rules
    : DEFAULT_PROJECT_STANDARD.scoring_rules;
  const total = rules.reduce((acc, rule) => {
    const max = DEFAULT_SCORE_MAX[rule.dimension] || rule.weight || 1;
    const earnedRatio = Math.max(0, Math.min(1, breakdown[rule.dimension] / max));
    return acc + earnedRatio * rule.weight;
  }, 0);
  return Math.min(100, Math.round(total));
}

async function scoreDemo2ProjectProcessState(root: string): Promise<number> {
  let score = 0;
  if (await dirHasFiles(path.join(root, '.demo2project', 'iterations'), /\.json$/)) score += 4;
  if (await dirHasFiles(path.join(root, '.demo2project', 'events'), /\.jsonl$/)) score += 3;
  if (await dirHasFiles(path.join(root, '.demo2project', 'evidence'), /\.json$/)) score += 2;
  const qaCaseCount = await jsonArrayLength(path.join(root, '.demo2project', 'qa-cases.json'));
  if (qaCaseCount !== null) score += qaCaseCount > 0 ? 3 : 1;
  return score;
}

async function dirHasFiles(dir: string, pattern: RegExp): Promise<boolean> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.some((entry) => entry.isFile() && pattern.test(entry.name));
  } catch {
    return false;
  }
}

async function jsonArrayLength(file: string): Promise<number | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8')) as unknown;
    return Array.isArray(parsed) ? parsed.length : null;
  } catch {
    return null;
  }
}
