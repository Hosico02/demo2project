import type {
  GapReport,
  IterationPlan,
  AgentTask,
  Severity,
} from './types.js';
import { shortId } from '../utils/time.js';

const MAX_TASKS_PER_ITERATION = 4;

/**
 * Turn a GapReport into a small, scoped IterationPlan.
 *
 * Important guarantees:
 *  - Every task carries acceptance_criteria.
 *  - Every task carries at least one verification_command (or a placeholder
 *    that the Executor will be required to replace).
 *  - We never plan more than MAX_TASKS_PER_ITERATION items per round.
 */
export function planIteration(
  gapReport: GapReport,
  goal: string,
  iterationId: string = shortId('iter'),
): IterationPlan {
  const snapshot = gapReport.project_snapshot;
  const sortedFindings = gapReport.findings
    .slice()
    .sort((a, b) => sevRank(a.severity) - sevRank(b.severity))
    .slice(0, MAX_TASKS_PER_ITERATION);

  const tasks: AgentTask[] = sortedFindings.map((f, idx) =>
    buildTaskForFinding(f, iterationId, idx, snapshot.test_commands, snapshot.build_commands),
  );

  const riskLevel: Severity = sortedFindings.some((f) => f.severity === 'blocker')
    ? 'blocker'
    : sortedFindings.some((f) => f.severity === 'high')
      ? 'high'
      : 'medium';

  const expectedDelta = Math.min(
    25,
    sortedFindings.reduce((acc, f) => acc + scoreDeltaForFinding(f.severity), 0),
  );

  return {
    iteration_id: iterationId,
    goal,
    project_path: snapshot.project_path,
    tasks,
    risk_level: riskLevel,
    expected_score_delta: expectedDelta,
    stop_conditions: [
      'project_score >= 86 (production_ready_baseline)',
      'no_progress_for_two_iterations',
      'unrecoverable_blocker_encountered',
      'safety_violation_detected',
      'user_requested_stop',
    ],
  };
}

function scoreDeltaForFinding(sev: Severity): number {
  switch (sev) {
    case 'blocker': return 10;
    case 'high': return 6;
    case 'medium': return 3;
    case 'low': return 1;
    default: return 0;
  }
}

function sevRank(s: Severity): number {
  switch (s) {
    case 'blocker': return 0;
    case 'high': return 1;
    case 'medium': return 2;
    case 'low': return 3;
    default: return 4;
  }
}

function buildTaskForFinding(
  f: GapReport['findings'][number],
  iterationId: string,
  idx: number,
  testCommands: string[],
  buildCommands: string[],
): AgentTask {
  const baseAccept = ['change applied without regressions', 'verification command exits 0'];
  const verifyForTest = testCommands.length > 0 ? testCommands : ['echo "no test command configured"'];
  const verifyForBuild = buildCommands.length > 0 ? buildCommands : ['echo "no build command configured"'];

  switch (f.category) {
    case 'missing_readme':
    case 'thin_readme':
      return {
        id: shortId('task'),
        iteration_id: iterationId,
        assigned_to: 'executor',
        title: 'Author or extend README.md',
        description: f.message,
        acceptance_criteria: [
          'README.md exists',
          'README contains Install + Usage sections',
          'README length >= 400 chars',
        ],
        expected_changed_files: ['README.md'],
        verification_commands: ['test -s README.md'],
        priority: f.severity,
        status: 'pending',
      };
    case 'no_tests':
      return {
        id: shortId('task'),
        iteration_id: iterationId,
        assigned_to: 'executor',
        title: 'Bootstrap a minimal test suite',
        description: f.message,
        acceptance_criteria: [
          'a test file exists under tests/ or alongside src/',
          'test runner command exits 0',
          'at least 1 assertion executes',
        ],
        expected_changed_files: ['tests/*'],
        verification_commands: verifyForTest,
        priority: f.severity,
        status: 'pending',
      };
    case 'missing_required_command': {
      const isTest = /test/.test(f.message);
      return {
        id: shortId('task'),
        iteration_id: iterationId,
        assigned_to: 'executor',
        title: isTest ? 'Add a test script' : 'Add a build script',
        description: f.message,
        acceptance_criteria: [
          'package.json (or equivalent) exposes the required script',
          'the script runs to completion',
        ],
        expected_changed_files: ['package.json'],
        verification_commands: isTest ? verifyForTest : verifyForBuild,
        priority: f.severity,
        status: 'pending',
      };
    }
    case 'missing_env_example':
      return {
        id: shortId('task'),
        iteration_id: iterationId,
        assigned_to: 'executor',
        title: 'Add .env.example',
        description: f.message,
        acceptance_criteria: ['.env.example exists', 'lists each env var used in the codebase'],
        expected_changed_files: ['.env.example'],
        verification_commands: ['test -f .env.example'],
        priority: f.severity,
        status: 'pending',
      };
    case 'no_ci':
      return {
        id: shortId('task'),
        iteration_id: iterationId,
        assigned_to: 'executor',
        title: 'Add minimal CI workflow',
        description: f.message,
        acceptance_criteria: [
          'CI config exists',
          'workflow runs install + test on push/PR',
        ],
        expected_changed_files: ['.github/workflows/ci.yml'],
        verification_commands: ['test -f .github/workflows/ci.yml'],
        priority: f.severity,
        status: 'pending',
      };
    default:
      return {
        id: shortId('task'),
        iteration_id: iterationId,
        assigned_to: 'executor',
        title: `Address gap: ${f.category}`,
        description: f.message,
        acceptance_criteria: baseAccept,
        expected_changed_files: f.related_files.length > 0 ? f.related_files : ['(see suggested_fix)'],
        verification_commands: verifyForTest,
        priority: f.severity,
        status: 'pending',
      };
  }
}
