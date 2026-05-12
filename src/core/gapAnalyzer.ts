import type {
  ProjectSnapshot,
  ProjectScore,
  ProjectStandard,
  GapReport,
  GapFinding,
  Severity,
} from './types.js';
import { DEFAULT_PROJECT_STANDARD } from '../standards/defaultProjectStandard.js';
import { listFiles, readTextSafe } from '../utils/fs.js';
import path from 'node:path';
import { shortId } from '../utils/time.js';

function finding(
  category: string,
  severity: Severity,
  message: string,
  why: string,
  fix: string,
  related: string[] = [],
): GapFinding {
  return {
    id: shortId('gap'),
    category,
    severity,
    message,
    why_it_matters: why,
    suggested_fix: fix,
    related_files: related,
  };
}

export async function analyzeGaps(
  snapshot: ProjectSnapshot,
  score: ProjectScore,
  standard: ProjectStandard = DEFAULT_PROJECT_STANDARD,
): Promise<GapReport> {
  const findings: GapFinding[] = [];
  const files = await listFiles(snapshot.project_path);
  const has = (rel: string): boolean =>
    files.includes(rel) || files.some((f) => f.startsWith(rel + '/'));

  // 1. Required files
  for (const req of standard.required_files) {
    if (!has(req)) {
      findings.push(
        finding(
          'missing_required_file',
          'high',
          `Missing required file: ${req}`,
          `${req} is part of the baseline project-ready standard.`,
          `Create ${req} with appropriate content.`,
          [req],
        ),
      );
    }
  }

  // 2. Recommended files
  for (const rec of standard.recommended_files) {
    if (!has(rec)) {
      findings.push(
        finding(
          'missing_recommended_file',
          'medium',
          `Missing recommended file/dir: ${rec}`,
          `${rec} improves maintainability and developer onboarding.`,
          `Create ${rec}.`,
          [rec],
        ),
      );
    }
  }

  // 3. Required commands
  const allCmds = [
    ...snapshot.test_commands,
    ...snapshot.build_commands,
    ...snapshot.start_commands,
  ];
  for (const req of standard.required_commands) {
    const present = allCmds.some((c) => c.includes(req));
    if (!present) {
      findings.push(
        finding(
          'missing_required_command',
          req === 'test' ? 'blocker' : 'high',
          `Missing required command: ${req}`,
          `Without a ${req} command the project cannot be validated automatically.`,
          `Add a "${req}" script to package.json (or equivalent).`,
        ),
      );
    }
  }

  // 4. README quality
  const readme = await readTextSafe(path.join(snapshot.project_path, 'README.md'));
  if (!readme) {
    findings.push(
      finding(
        'missing_readme',
        'high',
        'README.md missing',
        'No README means new contributors and downstream tools cannot orient.',
        'Add a README covering purpose, install, usage, and dev instructions.',
        ['README.md'],
      ),
    );
  } else if (readme.trim().length < 200) {
    findings.push(
      finding(
        'thin_readme',
        'medium',
        'README is very short',
        'A thin README usually means setup steps and usage are undocumented.',
        'Expand README with install/usage/development sections.',
        ['README.md'],
      ),
    );
  }

  // 5. Tests
  const hasAnyTestFile = files.some(
    (f) =>
      /\.(test|spec)\.(ts|tsx|js|jsx|py|mjs|cjs)$/.test(f) ||
      /(^|\/)tests?\//.test(f),
  );
  if (!hasAnyTestFile) {
    findings.push(
      finding(
        'no_tests',
        'blocker',
        'No tests found',
        'Without tests, demo-to-project iteration cannot verify any change.',
        'Add a minimal test suite covering the main entry point.',
      ),
    );
  }

  // 6. .env.example / config
  if (!has('.env.example') && (snapshot.detected_frameworks.length > 0 || snapshot.package_manager !== 'unknown')) {
    findings.push(
      finding(
        'missing_env_example',
        'low',
        'Missing .env.example',
        'New users have no template for required environment variables.',
        'Create .env.example listing every env var the project reads.',
        ['.env.example'],
      ),
    );
  }

  // 7. CI
  if (!has('.github/workflows') && !has('.gitlab-ci.yml') && !has('.circleci')) {
    findings.push(
      finding(
        'no_ci',
        'medium',
        'No CI configuration detected',
        'CI catches regressions across machines; demos that ship without CI break in unexpected environments.',
        'Add a minimal CI workflow that runs install + test + build.',
      ),
    );
  }

  // 8. Score-driven recommendations
  const recommendations: string[] = [];
  if (score.breakdown.test_score < 10) recommendations.push('Invest in test coverage first — it unlocks safe iteration.');
  if (score.breakdown.docs_score < 6) recommendations.push('Expand README and add a docs/ folder explaining architecture.');
  if (score.breakdown.agent_process_score < 6) recommendations.push('Adopt a QA / iteration discipline (this tool can help).');
  if (score.breakdown.build_score < 6) recommendations.push('Add an explicit build/typecheck step.');

  const blockers = findings.filter((f) => f.severity === 'blocker');

  return {
    project_snapshot: snapshot,
    score,
    findings: findings.sort((a, b) => sevRank(a.severity) - sevRank(b.severity)),
    blockers,
    recommendations,
  };
}

function sevRank(s: Severity): number {
  switch (s) {
    case 'blocker': return 0;
    case 'high': return 1;
    case 'medium': return 2;
    case 'low': return 3;
    case 'info': return 4;
  }
}
