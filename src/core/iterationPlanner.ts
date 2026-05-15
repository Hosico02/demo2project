import type {
  GapReport,
  IterationPlan,
  AgentTask,
  Severity,
  QACase,
} from './types.js';
import { shortId } from '../utils/time.js';

const MAX_TASKS_PER_ITERATION = 4;
const MAX_QA_FOCUS_CASES = 3;

export interface PlanIterationOptions {
  qaCases?: QACase[];
}

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
  opts: PlanIterationOptions = {},
): IterationPlan {
  const snapshot = gapReport.project_snapshot;
  const qaFocusCases = selectQaFocusCases(opts.qaCases ?? []);
  const sortedFindings = gapReport.findings
    .slice()
    .sort((a, b) => {
      const findingDelta = planFindingRank(a) - planFindingRank(b);
      if (findingDelta !== 0) return findingDelta;
      return sevRank(a.severity) - sevRank(b.severity);
    });
  const tasks: AgentTask[] = [];
  const selectedFindings: typeof sortedFindings = [];
  const seenTaskKeys = new Set<string>();

  for (const f of sortedFindings) {
    const task = buildTaskForFinding(
      f,
      iterationId,
      tasks.length,
      snapshot.detected_language,
      snapshot.test_commands,
      snapshot.build_commands,
    );
    const key = taskDedupKey(task);
    if (seenTaskKeys.has(key)) continue;
    seenTaskKeys.add(key);
    tasks.push(task);
    selectedFindings.push(f);
    if (tasks.length >= MAX_TASKS_PER_ITERATION) break;
  }
  applyQaFocus(tasks, qaFocusCases);

  const riskLevel: Severity = gapReport.findings.some((f) => f.severity === 'blocker')
    ? 'blocker'
    : gapReport.findings.some((f) => f.severity === 'high')
      ? 'high'
      : 'medium';

  const expectedDelta = Math.min(
    25,
    selectedFindings.reduce((acc, f) => acc + scoreDeltaForFinding(f.severity), 0),
  );

  return {
    iteration_id: iterationId,
    goal,
    project_path: snapshot.project_path,
    tasks,
    qa_focus_cases: qaFocusCases.map((c) => c.fingerprint),
    risk_level: riskLevel,
    expected_score_delta: expectedDelta,
    stop_conditions: [
      'project_score >= 86 (production_ready_baseline)',
      'no_open_gap_findings',
      'no_progress_for_two_iterations',
      'unrecoverable_blocker_encountered',
      'safety_violation_detected',
      'user_requested_stop',
    ],
  };
}

function selectQaFocusCases(cases: QACase[]): QACase[] {
  return cases
    .filter((c) => c.status === 'active' && c.lifecycle !== 'retired')
    .sort((a, b) => {
      const severityDelta = sevRank(a.severity) - sevRank(b.severity);
      if (severityDelta !== 0) return severityDelta;
      const usefulnessDelta = (b.usefulness_score ?? 0) - (a.usefulness_score ?? 0);
      if (usefulnessDelta !== 0) return usefulnessDelta;
      return (b.frequency ?? 0) - (a.frequency ?? 0);
    })
    .slice(0, MAX_QA_FOCUS_CASES);
}

function applyQaFocus(tasks: AgentTask[], cases: QACase[]): void {
  if (cases.length === 0) return;
  const guardrailText = cases
    .map((c) => `[${c.severity}] ${c.fingerprint}: ${c.expected_behavior || c.title}`)
    .join('\n');

  for (const task of tasks) {
    task.description = `${task.description}\n\nKnown QA guardrails:\n${guardrailText}`;
    for (const c of cases) {
      const assertion = c.regression_assertions[0] ?? c.expected_behavior ?? c.title;
      task.acceptance_criteria.push(`QA guard ${c.fingerprint}: ${assertion}`);
    }
    if (cases.some((c) => c.severity === 'blocker')) {
      task.priority = maxSeverity(task.priority, 'blocker');
    } else if (cases.some((c) => c.severity === 'high')) {
      task.priority = maxSeverity(task.priority, 'high');
    }
  }
}

function maxSeverity(a: Severity, b: Severity): Severity {
  return sevRank(a) <= sevRank(b) ? a : b;
}

function taskDedupKey(task: AgentTask): string {
  return [
    task.title,
    task.expected_changed_files.join('|'),
    task.verification_commands.join('|'),
  ].join('\0');
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

function planFindingRank(f: GapReport['findings'][number]): number {
  if (/^failed_.*verification$|^repair_failed_verification$/.test(f.category)) return 0;
  if (f.category === 'no_python_tests') return 1;
  if (f.category === 'missing_required_command' && /\bpytest\b/.test(f.message)) return 1;
  if (isProductContractOrSurfaceCategory(f.category)) return 2;
  return 3;
}

function isProductContractOrSurfaceCategory(category: string): boolean {
  return [
    'single_file_demo_without_intake_harness',
    'missing_cli_contract_harness',
    'missing_api_contract_harness',
    'missing_config_contract_harness',
    'missing_data_migration_harness',
    'missing_worker_contract_harness',
    'missing_demo_surface_contract_matrix',
    'missing_browser_extension_contract_harness',
    'missing_notebook_contract_harness',
    'missing_mobile_contract_harness',
    'missing_desktop_contract_harness',
    'missing_game_contract_harness',
    'missing_3d_scene_contract_harness',
    'missing_ml_model_contract_harness',
    'missing_media_pipeline_contract_harness',
    'demo_shell_without_product_core',
    'missing_product_runtime_entry',
    'missing_ui_product_verification',
    'below_web_ui_product_maturity',
    'missing_ui_runtime_render_smoke',
    'ui_unimplemented_hosted_service_claim',
    'missing_user_llm_provider_config',
    'broken_llm_provider_select_options',
    'incomplete_llm_provider_catalog',
    'llm_provider_catalog_missing_official_models',
    'llm_provider_catalog_outdated_against_official_refresh',
  ].includes(category);
}

function buildTaskForFinding(
  f: GapReport['findings'][number],
  iterationId: string,
  idx: number,
  detectedLanguage: string,
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
      if (/pytest/.test(f.message)) {
        return {
          id: shortId('task'),
          iteration_id: iterationId,
          assigned_to: 'executor',
          title: 'Add pytest-compatible verification',
          description: f.message,
          acceptance_criteria: ['pytest-compatible tests exist', 'test command exits 0'],
          expected_changed_files: ['tests/test_smoke.py', 'requirements.txt', 'package.json'],
          verification_commands: ['python3 -m pytest -q'],
          priority: f.severity,
          status: 'pending',
        };
      }
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
    case 'single_file_demo_without_intake_harness':
      return {
        id: shortId('task'),
        iteration_id: iterationId,
        assigned_to: 'executor',
        title: 'Add single-file demo intake harness',
        description: f.message,
        acceptance_criteria: [
          'docs/demo-intake.md records the source demo entry and inferred runtime',
          'scripts/demo-runtime-check.mjs performs deterministic entry checks without network access',
          'package.json exposes demo:intake-check for repeatable validation',
          'runtime contract is safe for Python, JavaScript/TypeScript and static HTML single-file demos',
        ],
        expected_changed_files: ['docs/demo-intake.md', 'scripts/demo-runtime-check.mjs', 'package.json'],
        verification_commands: ['node scripts/demo-runtime-check.mjs'],
        priority: f.severity,
        status: 'pending',
      };
    case 'missing_cli_contract_harness':
      return {
        id: shortId('task'),
        iteration_id: iterationId,
        assigned_to: 'executor',
        title: 'Add CLI executable contract harness',
        description: f.message,
        acceptance_criteria: [
          'scripts/cli-contract-check.mjs invokes the detected CLI entry with --help',
          'contract check fails when the entrypoint is missing, exits nonzero or produces empty help output',
          'docs/cli-contract.md documents the executable entry and verification command',
          'package scripts expose cli:contract-check without replacing test/build validation',
        ],
        expected_changed_files: ['scripts/cli-contract-check.mjs', 'docs/cli-contract.md', 'package.json'],
        verification_commands: ['node scripts/cli-contract-check.mjs'],
        priority: f.severity,
        status: 'pending',
      };
    case 'missing_api_contract_harness':
      return {
        id: shortId('task'),
        iteration_id: iterationId,
        assigned_to: 'executor',
        title: 'Add API contract harness',
        description: f.message,
        acceptance_criteria: [
          'docs/api-contract.md documents the detected API surface and contract boundary',
          'scripts/api-contract-check.mjs fails when no API surface evidence exists',
          'package scripts expose api:contract-check without replacing test/build validation',
        ],
        expected_changed_files: ['docs/api-contract.md', 'scripts/api-contract-check.mjs', 'package.json'],
        verification_commands: ['node scripts/api-contract-check.mjs'],
        priority: f.severity,
        status: 'pending',
      };
    case 'missing_config_contract_harness':
      return {
        id: shortId('task'),
        iteration_id: iterationId,
        assigned_to: 'executor',
        title: 'Add config contract harness',
        description: f.message,
        acceptance_criteria: [
          'scripts/config-contract-check.mjs extracts env var usage from source files',
          '.env.example documents every detected env var',
          'docs/config-contract.md records the runtime configuration boundary',
          'package scripts expose config:contract-check',
        ],
        expected_changed_files: ['docs/config-contract.md', 'scripts/config-contract-check.mjs', '.env.example', 'package.json'],
        verification_commands: ['node scripts/config-contract-check.mjs'],
        priority: f.severity,
        status: 'pending',
      };
    case 'missing_data_migration_harness':
      return {
        id: shortId('task'),
        iteration_id: iterationId,
        assigned_to: 'executor',
        title: 'Add data migration contract harness',
        description: f.message,
        acceptance_criteria: [
          'docs/data-contract.md records schema/migration expectations',
          'scripts/data-contract-check.mjs verifies migration, schema or model evidence exists',
          'package scripts expose data:contract-check',
        ],
        expected_changed_files: ['docs/data-contract.md', 'scripts/data-contract-check.mjs', 'package.json'],
        verification_commands: ['node scripts/data-contract-check.mjs'],
        priority: f.severity,
        status: 'pending',
      };
    case 'missing_worker_contract_harness':
      return {
        id: shortId('task'),
        iteration_id: iterationId,
        assigned_to: 'executor',
        title: 'Add worker contract harness',
        description: f.message,
        acceptance_criteria: [
          'docs/worker-contract.md records worker/queue entry expectations',
          'scripts/worker-contract-check.mjs verifies worker, job or scheduler evidence exists',
          'package scripts expose worker:contract-check',
        ],
        expected_changed_files: ['docs/worker-contract.md', 'scripts/worker-contract-check.mjs', 'package.json'],
        verification_commands: ['node scripts/worker-contract-check.mjs'],
        priority: f.severity,
        status: 'pending',
      };
    case 'missing_demo_surface_contract_matrix':
      return {
        id: shortId('task'),
        iteration_id: iterationId,
        assigned_to: 'executor',
        title: 'Add demo surface contract matrix',
        description: f.message,
        acceptance_criteria: [
          'docs/productization-surface-map.md records detected delivery surfaces and evidence',
          'scripts/surface-contract-check.mjs verifies specialized surface evidence without network access',
          'package scripts expose surface:contract-check',
          'surface map explains why agents must not apply unrelated UI/API/CLI assumptions',
        ],
        expected_changed_files: ['docs/productization-surface-map.md', 'scripts/surface-contract-check.mjs', 'package.json'],
        verification_commands: ['node scripts/surface-contract-check.mjs'],
        priority: f.severity,
        status: 'pending',
      };
    case 'missing_browser_extension_contract_harness':
      return specializedSurfaceTask(
        iterationId,
        f,
        'Add browser extension contract harness',
        [
          'docs/browser-extension-contract.md documents manifest, popup/background/content and permission boundaries',
          'scripts/browser-extension-contract-check.mjs validates manifest.json and referenced popup files',
          'package scripts expose extension:contract-check',
        ],
        ['docs/browser-extension-contract.md', 'scripts/browser-extension-contract-check.mjs', 'package.json'],
        'node scripts/browser-extension-contract-check.mjs',
      );
    case 'missing_notebook_contract_harness':
      return specializedSurfaceTask(
        iterationId,
        f,
        'Add notebook reproducibility contract harness',
        [
          'docs/notebook-contract.md documents the notebook-to-repeatable-script boundary',
          'scripts/notebook-contract-check.mjs validates notebooks are parseable and have cell arrays',
          'package scripts expose notebook:contract-check',
        ],
        ['docs/notebook-contract.md', 'scripts/notebook-contract-check.mjs', 'package.json'],
        'node scripts/notebook-contract-check.mjs',
      );
    case 'missing_mobile_contract_harness':
      return specializedSurfaceTask(
        iterationId,
        f,
        'Add mobile app contract harness',
        [
          'docs/mobile-contract.md documents Expo/React Native/Capacitor platform evidence',
          'scripts/mobile-contract-check.mjs validates mobile config or platform directories',
          'package scripts expose mobile:contract-check',
        ],
        ['docs/mobile-contract.md', 'scripts/mobile-contract-check.mjs', 'package.json'],
        'node scripts/mobile-contract-check.mjs',
      );
    case 'missing_desktop_contract_harness':
      return specializedSurfaceTask(
        iterationId,
        f,
        'Add desktop app contract harness',
        [
          'docs/desktop-contract.md documents Electron/Tauri shell entry and security boundary',
          'scripts/desktop-contract-check.mjs validates desktop shell evidence',
          'package scripts expose desktop:contract-check',
        ],
        ['docs/desktop-contract.md', 'scripts/desktop-contract-check.mjs', 'package.json'],
        'node scripts/desktop-contract-check.mjs',
      );
    case 'missing_game_contract_harness':
      return specializedSurfaceTask(
        iterationId,
        f,
        'Add game runtime contract harness',
        [
          'docs/game-contract.md documents game loop, input and asset boundaries',
          'scripts/game-contract-check.mjs validates game runtime evidence',
          'package scripts expose game:contract-check',
        ],
        ['docs/game-contract.md', 'scripts/game-contract-check.mjs', 'package.json'],
        'node scripts/game-contract-check.mjs',
      );
    case 'missing_3d_scene_contract_harness':
      return specializedSurfaceTask(
        iterationId,
        f,
        'Add 3D scene contract harness',
        [
          'docs/3d-scene-contract.md documents renderer, canvas and asset boundaries',
          'scripts/3d-scene-contract-check.mjs validates WebGL/3D scene evidence',
          'package scripts expose 3d:contract-check',
        ],
        ['docs/3d-scene-contract.md', 'scripts/3d-scene-contract-check.mjs', 'package.json'],
        'node scripts/3d-scene-contract-check.mjs',
      );
    case 'missing_ml_model_contract_harness':
      return specializedSurfaceTask(
        iterationId,
        f,
        'Add ML model contract harness',
        [
          'docs/ml-model-contract.md documents model artifacts, sample inputs and output schemas',
          'scripts/ml-model-contract-check.mjs validates model/framework evidence',
          'package scripts expose ml:contract-check',
        ],
        ['docs/ml-model-contract.md', 'scripts/ml-model-contract-check.mjs', 'package.json'],
        'node scripts/ml-model-contract-check.mjs',
      );
    case 'missing_media_pipeline_contract_harness':
      return specializedSurfaceTask(
        iterationId,
        f,
        'Add media pipeline contract harness',
        [
          'docs/media-pipeline-contract.md documents media input/output and fixture processing boundaries',
          'scripts/media-pipeline-contract-check.mjs validates media pipeline evidence',
          'package scripts expose media:contract-check',
        ],
        ['docs/media-pipeline-contract.md', 'scripts/media-pipeline-contract-check.mjs', 'package.json'],
        'node scripts/media-pipeline-contract-check.mjs',
      );
    case 'demo_shell_without_product_core':
      if (detectedLanguage === 'python') {
        return {
          id: shortId('task'),
          iteration_id: iterationId,
          assigned_to: 'executor',
          title: 'Implement product core spine',
          description: f.message,
          acceptance_criteria: [
            'source-level product core exists outside docs/scripts/test-only harnesses',
            'product core exposes capabilities and executable workflows',
            'tests exercise product core behavior directly',
            'at least one runtime entry or command is wired to the product core when applicable',
          ],
          expected_changed_files: ['src/product_core.py', 'tests/test_product_core.py', 'docs/product-core.md', 'package.json'],
          verification_commands: ['python3 -m pytest tests/test_product_core.py -q'],
          priority: 'high',
          status: 'pending',
        };
      }
      return {
        id: shortId('task'),
        iteration_id: iterationId,
        assigned_to: 'executor',
        title: 'Implement product core spine',
        description: f.message,
        acceptance_criteria: [
          'source-level product core exists outside docs/scripts/test-only harnesses',
          'product core exposes capabilities and executable workflows',
          'tests exercise product core behavior directly',
          'at least one runtime entry or command is wired to the product core when applicable',
        ],
        expected_changed_files: ['src/product-core.mjs', 'tests/product-core.test.mjs', 'docs/product-core.md', 'package.json'],
        verification_commands: ['node --test tests/product-core.test.mjs'],
        priority: f.severity,
        status: 'pending',
      };
    case 'missing_product_runtime_entry':
      return {
        id: shortId('task'),
        iteration_id: iterationId,
        assigned_to: 'executor',
        title: 'Add product runtime entry',
        description: f.message,
        acceptance_criteria: [
          'detected product surface has a user-runnable start command',
          'runtime entry loads the existing demo surface instead of only adding docs or tests',
          'scripts/product-runtime-check.mjs validates the runtime entry without launching a browser or device',
        ],
        expected_changed_files: ['package.json', 'scripts/product-runtime-check.mjs', 'index.html', 'App.js'],
        verification_commands: ['node scripts/product-runtime-check.mjs'],
        priority: f.severity,
        status: 'pending',
      };
    case 'no_ci':
    case 'misaligned_ci':
      return {
        id: shortId('task'),
        iteration_id: iterationId,
        assigned_to: 'executor',
        title: f.category === 'misaligned_ci' ? 'Update CI workflow for project stack' : 'Add minimal CI workflow',
        description: f.message,
        acceptance_criteria: [
          'CI config exists',
          'workflow runs install + test on push/PR for the detected stack',
        ],
        expected_changed_files: f.related_files.length > 0 ? f.related_files : ['.github/workflows/ci.yml'],
        verification_commands: ['test -f .github/workflows/ci.yml'],
        priority: f.severity,
        status: 'pending',
      };
    case 'no_python_tests':
      return {
        id: shortId('task'),
        iteration_id: iterationId,
        assigned_to: 'executor',
        title: 'Add Python smoke tests',
        description: f.message,
        acceptance_criteria: [
          'tests/test_smoke.py exists',
          'pytest-compatible test command exits 0',
          'Python source files compile',
        ],
        expected_changed_files: ['tests/test_smoke.py', 'requirements.txt', 'package.json'],
        verification_commands: ['python3 -m pytest -q'],
        priority: f.severity,
        status: 'pending',
      };
    case 'fake_build_command':
      return {
        id: shortId('task'),
        iteration_id: iterationId,
        assigned_to: 'executor',
        title: 'Replace echo-only build script',
        description: f.message,
        acceptance_criteria: ['build script validates source files'],
        expected_changed_files: ['package.json'],
        verification_commands: ['npm run build'],
        priority: f.severity,
        status: 'pending',
      };
    case 'misaligned_node_scaffold':
      return {
        id: shortId('task'),
        iteration_id: iterationId,
        assigned_to: 'executor',
        title: 'Align package scripts with Python project',
        description: f.message,
        acceptance_criteria: ['npm test delegates to Python tests', 'npm build validates Python sources'],
        expected_changed_files: ['package.json'],
        verification_commands: ['npm run test', 'npm run build'],
        priority: f.severity,
        status: 'pending',
      };
    case 'missing_healthcheck':
    case 'missing_config_guard':
      return {
        id: shortId('task'),
        iteration_id: iterationId,
        assigned_to: 'executor',
        title: 'Add Flask health and config guard',
        description: f.message,
        acceptance_criteria: ['/healthz returns status', '/start rejects missing API key clearly'],
        expected_changed_files: ['app.py', 'config.py', 'tests/test_app.py'],
        verification_commands: ['python3 -m pytest tests/test_app.py -q'],
        priority: f.severity,
        status: 'pending',
      };
    case 'missing_api_tests':
      return {
        id: shortId('task'),
        iteration_id: iterationId,
        assigned_to: 'executor',
        title: 'Add Flask API tests',
        description: f.message,
        acceptance_criteria: ['Flask public routes are covered by pytest'],
        expected_changed_files: ['tests/test_app.py'],
        verification_commands: ['python3 -m pytest tests/test_app.py -q'],
        priority: f.severity,
        status: 'pending',
      };
    case 'missing_wsgi_entrypoint':
    case 'missing_python_production_server':
    case 'missing_deployment_artifact':
      return {
        id: shortId('task'),
        iteration_id: iterationId,
        assigned_to: 'executor',
        title: 'Add Flask deployment scaffold',
        description: f.message,
        acceptance_criteria: ['Dockerfile exists', 'wsgi.py exposes app', 'gunicorn dependency exists'],
        expected_changed_files: ['Dockerfile', '.dockerignore', 'wsgi.py', 'requirements.txt'],
        verification_commands: [
          'test -f Dockerfile',
          'test -f wsgi.py',
          'python3 -c "from pathlib import Path; assert \'gunicorn\' in Path(\'requirements.txt\').read_text().lower()"',
        ],
        priority: f.severity,
        status: 'pending',
      };
    case 'missing_deployment_docs':
      return {
        id: shortId('task'),
        iteration_id: iterationId,
        assigned_to: 'executor',
        title: 'Document public demo deployment',
        description: f.message,
        acceptance_criteria: ['README documents Docker/gunicorn startup and health check'],
        expected_changed_files: ['README.md'],
        verification_commands: ['python3 -c "from pathlib import Path; t=Path(\'README.md\').read_text(); assert \'Docker\' in t and \'gunicorn\' in t and \'healthz\' in t"'],
        priority: f.severity,
        status: 'pending',
      };
    case 'missing_security_headers':
    case 'missing_start_input_validation':
    case 'missing_active_game_limit':
    case 'missing_structured_logging':
    case 'missing_industrial_api_tests':
      return {
        id: shortId('task'),
        iteration_id: iterationId,
        assigned_to: 'executor',
        title: 'Harden Flask public runtime controls',
        description: f.message,
        acceptance_criteria: [
          'every response includes defensive security headers',
          '/start rejects invalid mode values with HTTP 400',
          '/start clamps or rejects unsafe speed values',
          '/start rejects new games when the active game limit is reached',
          'runtime events and background errors are logged through a module logger',
          'Flask API tests cover these runtime controls',
        ],
        expected_changed_files: ['app.py', 'config.py', 'tests/test_app.py'],
        verification_commands: ['python3 -m pytest tests/test_app.py -q'],
        priority: f.severity,
        status: 'pending',
      };
    case 'failed_test_verification':
    case 'failed_build_verification': {
      const isTestFailure = f.category === 'failed_test_verification';
      return {
        id: shortId('task'),
        iteration_id: iterationId,
        assigned_to: 'executor',
        title: 'Repair failing project verification',
        description: [f.message, f.suggested_fix].filter(Boolean).join('\n\n'),
        acceptance_criteria: [
          'the failing verification command is reproduced',
          'the root cause is fixed in source or tests',
          'the failing verification command exits 0',
        ],
        expected_changed_files: f.related_files.length > 0
          ? f.related_files
          : (isTestFailure ? ['tests'] : ['(see failing build output)']),
        verification_commands: isTestFailure ? verifyForTest : verifyForBuild,
        priority: f.severity,
        status: 'pending',
      };
    }
    case 'missing_python_dependency_constraints':
    case 'unbounded_python_dependencies':
      return {
        id: shortId('task'),
        iteration_id: iterationId,
        assigned_to: 'executor',
        title: 'Add Python dependency constraints',
        description: f.message,
        acceptance_criteria: [
          'constraints.txt exists and bounds direct Python dependencies',
          'README install instructions use pip -c constraints.txt',
          'test command exits 0 after dependency policy changes',
        ],
        expected_changed_files: ['requirements.txt', 'constraints.txt', 'README.md'],
        verification_commands: [
          'python3 -c "from pathlib import Path; t=Path(\'constraints.txt\').read_text(); assert \'<\' in t or \'==\' in t"',
          ...verifyForTest,
        ],
        priority: f.severity,
        status: 'pending',
      };
    case 'missing_regression_tests':
      return {
        id: shortId('task'),
        iteration_id: iterationId,
        assigned_to: 'executor',
        title: 'Add Flask regression tests',
        description: f.message,
        acceptance_criteria: [
          'tests/test_regression.py exists',
          'regression tests cover health headers and invalid start input',
          'pytest regression command exits 0',
        ],
        expected_changed_files: ['tests/test_regression.py'],
        verification_commands: ['python3 -m pytest tests/test_regression.py -q'],
        priority: f.severity,
        status: 'pending',
      };
    case 'missing_operational_docs':
      return {
        id: shortId('task'),
        iteration_id: iterationId,
        assigned_to: 'executor',
        title: 'Add operational documentation',
        description: f.message,
        acceptance_criteria: [
          'docs/architecture.md explains runtime components and request flow',
          'docs/operations.md documents config, verification, deployment and rollback basics',
        ],
        expected_changed_files: ['docs/architecture.md', 'docs/operations.md'],
        verification_commands: ['test -s docs/architecture.md', 'test -s docs/operations.md'],
        priority: f.severity,
        status: 'pending',
      };
    case 'missing_user_llm_provider_config':
      return {
        id: shortId('task'),
        iteration_id: iterationId,
        assigned_to: 'executor',
        title: 'Add player-supplied LLM provider configuration',
        description: f.message,
        acceptance_criteria: [
          'UI lets each player choose DeepSeek, MiniMax, Qwen, OpenAI-compatible or custom provider settings',
          '/start accepts api_key, provider, model and base_url per game without persisting or logging the key',
          'server exposes public provider presets with no secrets',
          'player/game code uses the per-session LLM config instead of one server-wide key',
          'tests cover provider resolution, redaction and missing-key validation',
        ],
        expected_changed_files: ['app.py', 'player.py', 'game.py', 'templates/index.html', 'llm_config.py', 'tests/test_llm_config.py'],
        verification_commands: ['python3 -m pytest tests/test_llm_config.py -q'],
        priority: f.severity,
        status: 'pending',
      };
    case 'broken_llm_provider_select_options':
      return {
        id: shortId('task'),
        iteration_id: iterationId,
        assigned_to: 'executor',
        title: 'Repair LLM provider select option labels',
        description: f.message,
        acceptance_criteria: [
          'public provider presets expose non-empty UI labels and default models',
          'template option rendering falls back from label to name/id instead of producing blank options',
          'tests prove every provider preset has a non-empty select label',
        ],
        expected_changed_files: ['llm_config.py', 'templates/index.html', 'tests/test_llm_config.py'],
        verification_commands: ['python3 -m pytest tests/test_llm_config.py -q'],
        priority: f.severity,
        status: 'pending',
      };
    case 'incomplete_llm_provider_catalog':
    case 'llm_provider_catalog_missing_official_models':
    case 'llm_provider_catalog_outdated_against_official_refresh':
      return {
        id: shortId('task'),
        iteration_id: iterationId,
        assigned_to: 'executor',
        title: 'Expand player-selectable LLM provider catalog',
        description: f.message,
        acceptance_criteria: [
          'public provider presets include DeepSeek, MiniMax, Qwen, OpenAI-compatible and custom endpoints',
          'provider presets include non-empty labels, default models and model option lists where applicable',
          'provider model options cite official model documentation sources',
          'tests prove supported provider coverage and no API keys are exposed',
        ],
        expected_changed_files: ['llm_config.py', 'templates/index.html', 'tests/test_llm_config.py'],
        verification_commands: ['python3 -m pytest tests/test_llm_config.py -q'],
        priority: f.severity,
        status: 'pending',
      };
    case 'missing_ui_product_verification':
    case 'below_web_ui_product_maturity':
      return {
        id: shortId('task'),
        iteration_id: iterationId,
        assigned_to: 'executor',
        title: 'Add UI product verification harness',
        description: f.message,
        acceptance_criteria: [
          'browser-level UI smoke test scaffold exists',
          'responsive desktop and mobile viewport checks are documented in the harness',
          'deterministic UI product check script runs in CI without external services',
          'package scripts expose ui:check and optional ui:e2e commands',
        ],
        expected_changed_files: ['scripts/ui-product-check.mjs', 'playwright.config.ts', 'tests/ui/smoke.spec.ts', 'package.json'],
        verification_commands: ['node scripts/ui-product-check.mjs'],
        priority: f.severity,
        status: 'pending',
      };
    case 'missing_ui_runtime_render_smoke':
      return {
        id: shortId('task'),
        iteration_id: iterationId,
        assigned_to: 'executor',
        title: 'Add UI runtime render smoke verification',
        description: f.message,
        acceptance_criteria: [
          'render smoke script exists and documents how to run against a local dev/preview server',
          'browser smoke spec rejects blank pages and horizontal overflow',
          'desktop and mobile screenshots are captured by the runtime smoke path',
          'package scripts expose ui:render-check without replacing build/test validation',
        ],
        expected_changed_files: ['scripts/ui-render-smoke.mjs', 'tests/ui/smoke.spec.ts', 'playwright.config.ts', 'package.json'],
        verification_commands: ['node scripts/ui-product-check.mjs'],
        priority: f.severity,
        status: 'pending',
      };
    case 'ui_pointer_only_interaction':
    case 'ui_hidden_system_cursor':
    case 'ui_reactive_mousemove_cursor':
    case 'ui_fixed_title_scale':
    case 'ui_sticky_anchor_overlap':
    case 'ui_placeholder_copy':
    case 'ui_navigation_semantics':
    case 'ui_css_cleanup_needed':
    case 'ui_variant_style_drift':
      return {
        id: shortId('task'),
        iteration_id: iterationId,
        assigned_to: 'executor',
        title: 'Harden UI interaction, accessibility and polish',
        description: f.message,
        acceptance_criteria: [
          'mouse-hover-only UI has keyboard and touch access paths',
          'navigation landmarks and focusable custom controls expose accessible semantics',
          'decorative cursor and pointer effects do not hide the system cursor globally',
          'display typography and sticky anchors remain usable across narrow and zoomed viewports',
          'placeholder copy and stale CSS residue are removed where safely detectable',
        ],
        expected_changed_files: ['src', 'app', 'pages', 'components', 'styles', 'templates', 'static', 'example'],
        verification_commands: buildCommands.length > 0 ? [buildCommands[0]!] : verifyForTest,
        priority: f.severity,
        status: 'pending',
      };
    case 'ui_unimplemented_hosted_service_claim':
      return {
        id: shortId('task'),
        iteration_id: iterationId,
        assigned_to: 'executor',
        title: 'Align UI service claims with implemented backend',
        description: f.message,
        acceptance_criteria: [
          'public UI no longer promises hosted upload, processing or artifact-return flows without backend evidence',
          'file-upload controls are removed or clearly replaced by beta/local CLI usage guidance',
          'service copy names the current supported workflow and does not imply a live hosted processor',
          'build verification still passes after the copy and markup change',
        ],
        expected_changed_files: ['src', 'app', 'pages', 'components', 'templates', 'static', 'example', 'README.md'],
        verification_commands: buildCommands.length > 0 ? [buildCommands[0]!] : verifyForTest,
        priority: f.severity,
        status: 'pending',
      };
    case 'missing_social_deduction_rules_engine':
    case 'random_social_deduction_tie_breaker':
    case 'missing_social_deduction_rule_tests':
    case 'missing_social_deduction_mode_validation':
    case 'missing_social_deduction_mode_tests':
    case 'missing_social_deduction_mode_startup_guard':
    case 'missing_game_design_doc':
      return {
        id: shortId('task'),
        iteration_id: iterationId,
        assigned_to: 'executor',
        title: 'Add social deduction rules engine',
        description: f.message,
        acceptance_criteria: [
          'rules.py exposes deterministic vote and win-condition helpers',
          'rules.py exposes mode validation for wolf ratio and role-count sanity',
          'game.py calls the rules helpers instead of random tie execution',
          'tests/test_rules.py covers ties, clear vote execution, win conditions, role distribution and mode validation',
          'docs/game-design.md documents gameplay policy',
        ],
        expected_changed_files: ['game.py', 'rules.py', 'tests/test_rules.py', 'docs/game-design.md'],
        verification_commands: ['python3 -m pytest tests/test_rules.py -q'],
        priority: f.severity,
        status: 'pending',
      };
    case 'disconnected_social_product_backbone':
      return {
        id: shortId('task'),
        iteration_id: iterationId,
        assigned_to: 'executor',
        title: 'Integrate social product backbone into app workflows',
        description: f.message,
        acceptance_criteria: [
          'Flask runtime imports and invokes product backbone systems',
          'browser-visible routes or controls expose account, lobby, moderation, ranking, history and host workflows',
          'endpoint tests exercise product workflows through the running app surface',
        ],
        expected_changed_files: ['app.py', 'templates/index.html', 'tests/test_product_integration.py', 'docs/market-parity.md'],
        verification_commands: ['python3 -m pytest tests/test_product_integration.py -q'],
        priority: f.severity,
        status: 'pending',
      };
    case 'below_social_deduction_market_parity':
      return {
        id: shortId('task'),
        iteration_id: iterationId,
        assigned_to: 'executor',
        title: 'Implement social deduction product backbone',
        description: f.message,
        acceptance_criteria: [
          'market parity backbone modules exist for account/profile, lobby/matchmaking, moderation, ranking, history, liveops, admin and host controls',
          'tests/test_product_backbone.py exercises the product backbone as executable behavior',
          'docs/market-parity.md separates implemented backbone from capabilities that still need production infrastructure',
        ],
        expected_changed_files: [
          'accounts.py',
          'lobby.py',
          'communication.py',
          'moderation.py',
          'ranking.py',
          'history.py',
          'roles_catalog.py',
          'liveops.py',
          'admin.py',
          'host_controls.py',
          'tests/test_product_backbone.py',
          'docs/market-parity.md',
          'package.json',
        ],
        verification_commands: ['python3 -m pytest tests/test_product_backbone.py -q'],
        priority: f.severity,
        status: 'pending',
      };
    case 'below_market_research_parity':
      return {
        id: shortId('task'),
        iteration_id: iterationId,
        assigned_to: 'executor',
        title: 'Define source-cited market research roadmap',
        description: f.message,
        acceptance_criteria: [
          'docs/market-research-roadmap.md summarizes source-cited market capabilities',
          'roadmap separates required, recommended and out-of-scope capabilities',
          'each proposed capability keeps competitor source URLs as evidence',
          'roadmap states that source research must not copy competitor text, code, UI or brand assets',
        ],
        expected_changed_files: ['docs/market-research-roadmap.md'],
        verification_commands: ['test -s docs/market-research-roadmap.md'],
        priority: f.severity,
        status: 'pending',
      };
    default:
      if (f.category === 'missing_required_file' && f.related_files.includes('pyproject.toml')) {
        return {
          id: shortId('task'),
          iteration_id: iterationId,
          assigned_to: 'executor',
          title: 'Add minimal pyproject.toml',
          description: f.message,
          acceptance_criteria: ['pyproject.toml exists', 'project metadata is declared'],
          expected_changed_files: ['pyproject.toml'],
          verification_commands: ['test -f pyproject.toml'],
          priority: f.severity,
          status: 'pending',
        };
      }
      if (f.category === 'missing_recommended_file' && f.related_files.includes('CHANGELOG.md')) {
        return {
          id: shortId('task'),
          iteration_id: iterationId,
          assigned_to: 'executor',
          title: 'Add CHANGELOG.md',
          description: f.message,
          acceptance_criteria: ['CHANGELOG.md exists', 'contains an Unreleased section'],
          expected_changed_files: ['CHANGELOG.md'],
          verification_commands: ['test -s CHANGELOG.md'],
          priority: f.severity,
          status: 'pending',
        };
      }
      return {
        id: shortId('task'),
        iteration_id: iterationId,
        assigned_to: 'executor',
        title: `Address gap: ${f.category}${fileSuffix(f.related_files)}`,
        description: f.message,
        acceptance_criteria: baseAccept,
        expected_changed_files: f.related_files.length > 0 ? f.related_files : ['(see suggested_fix)'],
        verification_commands: verifyForTest,
        priority: f.severity,
        status: 'pending',
      };
  }
}

function specializedSurfaceTask(
  iterationId: string,
  f: GapReport['findings'][number],
  title: string,
  acceptanceCriteria: string[],
  expectedChangedFiles: string[],
  verificationCommand: string,
): AgentTask {
  return {
    id: shortId('task'),
    iteration_id: iterationId,
    assigned_to: 'executor',
    title,
    description: f.message,
    acceptance_criteria: acceptanceCriteria,
    expected_changed_files: expectedChangedFiles,
    verification_commands: [verificationCommand],
    priority: f.severity,
    status: 'pending',
  };
}

function fileSuffix(files: string[]): string {
  return files.length > 0 ? ` (${files.join(', ')})` : '';
}
