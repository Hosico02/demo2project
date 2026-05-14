import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AnalyzerAgent } from '../src/agents/AnalyzerAgent.js';
import { PlannerAgent } from '../src/agents/PlannerAgent.js';
import type { GapReport } from '../src/core/types.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const badDemo = path.resolve(here, '..', 'examples', 'bad-demo');

describe('iterationPlanner', () => {
  it('produces tasks with acceptance criteria and verification commands', async () => {
    const analyzer = new AnalyzerAgent();
    const planner = new PlannerAgent();
    const { gap } = await analyzer.fullAnalyze(badDemo);
    const plan = planner.plan(gap, 'project-ready');
    expect(plan.tasks.length).toBeGreaterThan(0);
    for (const t of plan.tasks) {
      expect(t.acceptance_criteria.length).toBeGreaterThan(0);
      expect(t.verification_commands.length).toBeGreaterThan(0);
      expect(t.iteration_id).toBe(plan.iteration_id);
    }
    expect(plan.stop_conditions.length).toBeGreaterThan(0);
    expect(plan.expected_score_delta).toBeGreaterThan(0);
  });

  it('plans production-readiness tasks for Flask deployment gaps', () => {
    const planner = new PlannerAgent();
    const gap = {
      project_snapshot: {
        project_path: '/tmp/flask-demo',
        detected_language: 'python',
        detected_frameworks: ['flask'],
        package_manager: 'pip',
        test_commands: ['python3 -m pytest -q'],
        build_commands: [],
        start_commands: ['python3 app.py'],
        important_files: ['app.py', 'requirements.txt', 'tests'],
        missing_files: [],
        dependency_summary: { runtime: 0, dev: 0, has_lockfile: false },
        timestamp: new Date(0).toISOString(),
      },
      score: { total: 70, grade: 'structured_prototype', breakdown: {} as never, notes: [] },
      findings: [
        {
          id: 'gap-health',
          category: 'missing_healthcheck',
          severity: 'high',
          message: 'Missing health check endpoint',
          why_it_matters: '',
          suggested_fix: '',
          related_files: ['app.py'],
        },
        {
          id: 'gap-deploy',
          category: 'missing_deployment_artifact',
          severity: 'medium',
          message: 'Missing Dockerfile',
          why_it_matters: '',
          suggested_fix: '',
          related_files: ['Dockerfile'],
        },
      ],
      blockers: [],
      recommendations: [],
    } satisfies GapReport;

    const plan = planner.plan(gap, 'public demo deployment');

    expect(plan.tasks.map((t) => t.title)).toContain('Add Flask health and config guard');
    expect(plan.tasks.map((t) => t.title)).toContain('Add Flask deployment scaffold');
  });

  it('plans industrial runtime hardening for Flask product gaps', () => {
    const planner = new PlannerAgent();
    const baseFinding = {
      id: 'gap-runtime',
      severity: 'high' as const,
      message: 'runtime control missing',
      why_it_matters: '',
      suggested_fix: '',
      related_files: ['app.py', 'tests/test_app.py'],
    };
    const gap = {
      project_snapshot: {
        project_path: '/tmp/flask-demo',
        detected_language: 'python',
        detected_frameworks: ['flask'],
        package_manager: 'pip',
        test_commands: ['python3 -m pytest -q'],
        build_commands: [],
        start_commands: ['python3 app.py'],
        important_files: ['app.py', 'requirements.txt', 'tests'],
        missing_files: [],
        dependency_summary: { runtime: 0, dev: 0, has_lockfile: false },
        timestamp: new Date(0).toISOString(),
      },
      score: { total: 86, grade: 'production_ready_baseline', breakdown: {} as never, notes: [] },
      findings: [
        { ...baseFinding, category: 'missing_security_headers' },
        { ...baseFinding, id: 'gap-input', category: 'missing_start_input_validation' },
        { ...baseFinding, id: 'gap-limit', category: 'missing_active_game_limit' },
      ],
      blockers: [],
      recommendations: [],
    } satisfies GapReport;

    const plan = planner.plan(gap, 'industrial Flask product hardening');
    const harden = plan.tasks.find((t) => t.title === 'Harden Flask public runtime controls');

    expect(harden).toBeTruthy();
    expect(harden?.expected_changed_files).toContain('app.py');
    expect(harden?.expected_changed_files).toContain('tests/test_app.py');
    expect(harden?.verification_commands).toEqual(['python3 -m pytest tests/test_app.py -q']);
  });

  it('plans a repair task when project verification fails', () => {
    const planner = new PlannerAgent();
    const gap = {
      project_snapshot: {
        project_path: '/tmp/flask-demo',
        detected_language: 'python',
        detected_frameworks: ['flask'],
        package_manager: 'pip',
        test_commands: ['python3 -m pytest -q'],
        build_commands: [],
        start_commands: ['python3 app.py'],
        important_files: ['app.py', 'requirements.txt', 'tests'],
        missing_files: [],
        dependency_summary: { runtime: 0, dev: 0, has_lockfile: false },
        timestamp: new Date(0).toISOString(),
      },
      score: { total: 49, grade: 'working_demo', breakdown: {} as never, notes: [] },
      findings: [
        {
          id: 'gap-red-test',
          category: 'failed_test_verification',
          severity: 'blocker',
          message: 'Test verification failed: python3 -m pytest -q',
          why_it_matters: '',
          suggested_fix: '',
          related_files: ['app.py', 'config.py', 'tests/test_app.py'],
        },
      ],
      blockers: [],
      recommendations: [],
    } satisfies GapReport;

    const plan = planner.plan(gap, 'repair red verification');
    const repair = plan.tasks.find((t) => t.title === 'Repair failing project verification');

    expect(repair).toBeTruthy();
    expect(repair?.priority).toBe('blocker');
    expect(repair?.expected_changed_files).toContain('tests/test_app.py');
    expect(repair?.verification_commands).toEqual(['python3 -m pytest -q']);
  });

  it('plans Python dependency constraint hardening', () => {
    const planner = new PlannerAgent();
    const gap = {
      project_snapshot: {
        project_path: '/tmp/python-demo',
        detected_language: 'python',
        detected_frameworks: ['pytest'],
        package_manager: 'pip',
        test_commands: ['python3 -m pytest -q'],
        build_commands: [],
        start_commands: ['python3 app.py'],
        important_files: ['README.md', 'requirements.txt', 'tests'],
        missing_files: [],
        dependency_summary: { runtime: 0, dev: 0, has_lockfile: false },
        timestamp: new Date(0).toISOString(),
      },
      score: { total: 80, grade: 'project_ready_candidate', breakdown: {} as never, notes: [] },
      findings: [
        {
          id: 'gap-deps',
          category: 'missing_python_dependency_constraints',
          severity: 'high',
          message: 'Missing Python dependency constraints',
          why_it_matters: '',
          suggested_fix: '',
          related_files: ['requirements.txt', 'constraints.txt', 'README.md'],
        },
      ],
      blockers: [],
      recommendations: [],
    } satisfies GapReport;

    const plan = planner.plan(gap, 'make installs reproducible');
    const deps = plan.tasks.find((t) => t.title === 'Add Python dependency constraints');

    expect(deps).toBeTruthy();
    expect(deps?.expected_changed_files).toContain('constraints.txt');
    expect(deps?.verification_commands).toContain('python3 -m pytest -q');
  });

  it('plans Flask regression tests and operational docs', () => {
    const planner = new PlannerAgent();
    const baseSnapshot = {
      project_path: '/tmp/flask-demo',
      detected_language: 'python',
      detected_frameworks: ['flask', 'pytest'],
      package_manager: 'pip',
      test_commands: ['python3 -m pytest -q'],
      build_commands: [],
      start_commands: ['python3 app.py'],
      important_files: ['README.md', 'app.py', 'requirements.txt', 'tests'],
      missing_files: [],
      dependency_summary: { runtime: 0, dev: 0, has_lockfile: true },
      timestamp: new Date(0).toISOString(),
    };
    const gap = {
      project_snapshot: baseSnapshot,
      score: { total: 86, grade: 'production_ready_baseline', breakdown: {} as never, notes: [] },
      findings: [
        {
          id: 'gap-regression',
          category: 'missing_regression_tests',
          severity: 'high',
          message: 'Missing regression tests',
          why_it_matters: '',
          suggested_fix: '',
          related_files: ['tests/test_regression.py'],
        },
        {
          id: 'gap-docs',
          category: 'missing_operational_docs',
          severity: 'medium',
          message: 'Missing operational docs',
          why_it_matters: '',
          suggested_fix: '',
          related_files: ['docs/architecture.md', 'docs/operations.md'],
        },
      ],
      blockers: [],
      recommendations: [],
    } satisfies GapReport;

    const plan = planner.plan(gap, 'raise product maturity');

    expect(plan.tasks.map((t) => t.title)).toContain('Add Flask regression tests');
    expect(plan.tasks.map((t) => t.title)).toContain('Add operational documentation');
  });

  it('plans social deduction content hardening from game-rule gaps', () => {
    const planner = new PlannerAgent();
    const gap = {
      project_snapshot: {
        project_path: '/tmp/werewolf-demo',
        detected_language: 'python',
        detected_frameworks: ['pytest'],
        package_manager: 'pip',
        test_commands: ['python3 -m pytest -q'],
        build_commands: [],
        start_commands: ['python3 app.py'],
        important_files: ['README.md', 'game.py', 'tests'],
        missing_files: [],
        dependency_summary: { runtime: 0, dev: 0, has_lockfile: true },
        timestamp: new Date(0).toISOString(),
      },
      score: { total: 90, grade: 'production_ready_baseline', breakdown: {} as never, notes: [] },
      findings: [
        {
          id: 'gap-rules',
          category: 'missing_social_deduction_rules_engine',
          severity: 'high',
          message: 'Missing social deduction rules engine',
          why_it_matters: '',
          suggested_fix: '',
          related_files: ['game.py', 'rules.py', 'tests/test_rules.py'],
        },
        {
          id: 'gap-tie',
          category: 'random_social_deduction_tie_breaker',
          severity: 'high',
          message: 'Random tie breaker',
          why_it_matters: '',
          suggested_fix: '',
          related_files: ['game.py', 'rules.py'],
        },
        {
          id: 'gap-mode-validation',
          category: 'missing_social_deduction_mode_validation',
          severity: 'high',
          message: 'Missing social deduction mode validation',
          why_it_matters: '',
          suggested_fix: '',
          related_files: ['rules.py', 'tests/test_rules.py'],
        },
        {
          id: 'gap-mode-startup',
          category: 'missing_social_deduction_mode_startup_guard',
          severity: 'high',
          message: 'Missing startup mode validation',
          why_it_matters: '',
          suggested_fix: '',
          related_files: ['game.py', 'rules.py'],
        },
      ],
      blockers: [],
      recommendations: [],
    } satisfies GapReport;

    const plan = planner.plan(gap, 'make werewolf content product-grade');
    const task = plan.tasks.find((t) => t.title === 'Add social deduction rules engine');

    expect(task).toBeTruthy();
    expect(task?.expected_changed_files).toContain('rules.py');
    expect(task?.expected_changed_files).toContain('game.py');
    expect(task?.expected_changed_files).toContain('tests/test_rules.py');
    expect(task?.acceptance_criteria.join('\n')).toContain('mode validation');
    expect(task?.verification_commands).toContain('python3 -m pytest tests/test_rules.py -q');
  });

  it('plans a market parity roadmap when engineering baseline is mistaken for a mature social game', () => {
    const planner = new PlannerAgent();
    const gap = {
      project_snapshot: {
        project_path: '/tmp/werewolf-demo',
        detected_language: 'python',
        detected_frameworks: ['flask', 'pytest'],
        package_manager: 'pip',
        test_commands: ['python3 -m pytest -q'],
        build_commands: [],
        start_commands: ['python3 app.py'],
        important_files: ['README.md', 'game.py', 'rules.py', 'tests'],
        missing_files: [],
        dependency_summary: { runtime: 0, dev: 0, has_lockfile: true },
        timestamp: new Date(0).toISOString(),
      },
      score: { total: 100, grade: 'production_ready_baseline', breakdown: {} as never, notes: [] },
      findings: [
        {
          id: 'gap-market',
          category: 'below_social_deduction_market_parity',
          severity: 'medium',
          message: 'Below social deduction market parity',
          why_it_matters: '',
          suggested_fix: '',
          related_files: ['docs/market-parity.md'],
        },
      ],
      blockers: [],
      recommendations: [],
      product_maturity: {
        domain: 'social_deduction_game',
        target_market: 'mature online werewolf/social deduction product',
        score: 25,
        level: 'demo',
        summary: '2/12 capabilities',
        capabilities: [],
        missing_capabilities: ['Account identity and player profiles'],
        references: [],
      },
    } satisfies GapReport;

    const plan = planner.plan(gap, 'reach mature social deduction product parity');
    const task = plan.tasks.find((t) => t.title === 'Define social deduction market parity roadmap');

    expect(task).toBeTruthy();
    expect(task?.expected_changed_files).toContain('docs/market-parity.md');
    expect(task?.acceptance_criteria.join('\n')).toContain('market parity');
  });

  it('plans player-supplied LLM provider configuration for public LLM demos', () => {
    const planner = new PlannerAgent();
    const gap = {
      project_snapshot: {
        project_path: '/tmp/llm-demo',
        detected_language: 'python',
        detected_frameworks: ['flask', 'pytest'],
        package_manager: 'pip',
        test_commands: ['python3 -m pytest -q'],
        build_commands: [],
        start_commands: ['python3 app.py'],
        important_files: ['app.py', 'player.py', 'templates'],
        missing_files: [],
        dependency_summary: { runtime: 0, dev: 0, has_lockfile: true },
        timestamp: new Date(0).toISOString(),
      },
      score: { total: 88, grade: 'production_ready_baseline', breakdown: {} as never, notes: [] },
      findings: [
        {
          id: 'gap-llm-provider',
          category: 'missing_user_llm_provider_config',
          severity: 'high',
          message: 'Missing player-supplied LLM provider configuration',
          why_it_matters: '',
          suggested_fix: '',
          related_files: ['app.py', 'player.py', 'templates/index.html', 'llm_config.py'],
        },
      ],
      blockers: [],
      recommendations: [],
    } satisfies GapReport;

    const plan = planner.plan(gap, 'let each player bring their own model key');
    const task = plan.tasks.find((t) => t.title === 'Add player-supplied LLM provider configuration');

    expect(task).toBeTruthy();
    expect(task?.expected_changed_files).toContain('llm_config.py');
    expect(task?.expected_changed_files).toContain('templates/index.html');
    expect(task?.acceptance_criteria.join('\n')).toContain('DeepSeek');
    expect(task?.verification_commands).toContain('python3 -m pytest tests/test_llm_config.py -q');
  });

  it('plans UI product verification for pure UI demos', () => {
    const planner = new PlannerAgent();
    const gap = {
      project_snapshot: {
        project_path: '/tmp/ui-demo',
        detected_language: 'typescript',
        detected_frameworks: ['react', 'vitest'],
        package_manager: 'pnpm',
        test_commands: ['pnpm test'],
        build_commands: ['pnpm build'],
        start_commands: ['pnpm dev'],
        important_files: ['README.md', 'package.json', 'src', 'tests'],
        missing_files: [],
        dependency_summary: { runtime: 2, dev: 2, has_lockfile: true },
        timestamp: new Date(0).toISOString(),
      },
      score: { total: 52, grade: 'structured_prototype', breakdown: {} as never, notes: [] },
      findings: [
        {
          id: 'gap-ui',
          category: 'missing_ui_product_verification',
          severity: 'high',
          message: 'UI app is missing browser-level product verification',
          why_it_matters: '',
          suggested_fix: '',
          related_files: ['scripts/ui-product-check.mjs', 'tests/ui/smoke.spec.ts'],
        },
      ],
      blockers: [],
      recommendations: [],
    } satisfies GapReport;

    const plan = planner.plan(gap, 'make UI shippable');
    const task = plan.tasks.find((t) => t.title === 'Add UI product verification harness');

    expect(task).toBeTruthy();
    expect(task?.expected_changed_files).toContain('scripts/ui-product-check.mjs');
    expect(task?.expected_changed_files).toContain('tests/ui/smoke.spec.ts');
    expect(task?.verification_commands).toContain('node scripts/ui-product-check.mjs');
  });

  it('plans runtime render smoke verification for UI browser harness gaps', () => {
    const planner = new PlannerAgent();
    const gap = {
      project_snapshot: {
        project_path: '/tmp/ui-demo',
        detected_language: 'typescript',
        detected_frameworks: ['vue'],
        package_manager: 'npm',
        test_commands: ['npm test'],
        build_commands: ['npm run build'],
        start_commands: ['npm run dev'],
        important_files: ['src/App.vue', 'playwright.config.ts'],
        missing_files: [],
        dependency_summary: { runtime: 2, dev: 3, has_lockfile: true },
        timestamp: new Date(0).toISOString(),
      },
      score: { total: 78, grade: 'project_ready_candidate', breakdown: {} as never, notes: [] },
      findings: [
        {
          id: 'gap-render',
          category: 'missing_ui_runtime_render_smoke',
          severity: 'medium',
          message: 'UI browser harness lacks runtime render smoke checks',
          why_it_matters: '',
          suggested_fix: '',
          related_files: ['scripts/ui-render-smoke.mjs', 'tests/ui/smoke.spec.ts'],
        },
      ],
      blockers: [],
      recommendations: [],
    } satisfies GapReport;

    const plan = planner.plan(gap, 'make UI render-verifiable');
    const task = plan.tasks.find((t) => t.title === 'Add UI runtime render smoke verification');

    expect(task).toBeTruthy();
    expect(task?.expected_changed_files).toContain('scripts/ui-render-smoke.mjs');
    expect(task?.verification_commands).toContain('node scripts/ui-product-check.mjs');
  });

  it('plans intake/runtime contract harness for single-file demos', () => {
    const planner = new PlannerAgent();
    const gap = {
      project_snapshot: {
        project_path: '/tmp/single-demo',
        detected_language: 'python',
        detected_frameworks: [],
        package_manager: 'unknown',
        test_commands: [],
        build_commands: [],
        start_commands: ['python3 demo.py'],
        important_files: ['demo.py'],
        missing_files: ['README.md'],
        dependency_summary: { runtime: 0, dev: 0, has_lockfile: false },
        timestamp: new Date(0).toISOString(),
      },
      score: { total: 22, grade: 'raw_demo', breakdown: {} as never, notes: [] },
      findings: [
        {
          id: 'gap-single',
          category: 'single_file_demo_without_intake_harness',
          severity: 'high',
          message: 'Single-file demo lacks intake/runtime contract harness',
          why_it_matters: '',
          suggested_fix: '',
          related_files: ['demo.py'],
        },
      ],
      blockers: [],
      recommendations: [],
    } satisfies GapReport;

    const plan = planner.plan(gap, 'productize single-file demo');
    const task = plan.tasks.find((t) => t.title === 'Add single-file demo intake harness');

    expect(task).toBeTruthy();
    expect(task?.expected_changed_files).toContain('scripts/demo-runtime-check.mjs');
    expect(task?.expected_changed_files).toContain('docs/demo-intake.md');
    expect(task?.verification_commands).toContain('node scripts/demo-runtime-check.mjs');
  });

  it('plans executable CLI contract harness for CLI projects', () => {
    const planner = new PlannerAgent();
    const gap = {
      project_snapshot: {
        project_path: '/tmp/cli-demo',
        detected_language: 'javascript',
        detected_frameworks: [],
        package_manager: 'npm',
        test_commands: ['npm test'],
        build_commands: ['npm run build'],
        start_commands: [],
        important_files: ['package.json', 'bin/cli.js', 'tests'],
        missing_files: [],
        dependency_summary: { runtime: 0, dev: 0, has_lockfile: true },
        timestamp: new Date(0).toISOString(),
      },
      score: { total: 72, grade: 'project_ready_candidate', breakdown: {} as never, notes: [] },
      findings: [
        {
          id: 'gap-cli',
          category: 'missing_cli_contract_harness',
          severity: 'medium',
          message: 'CLI project lacks executable contract harness',
          why_it_matters: '',
          suggested_fix: '',
          related_files: ['scripts/cli-contract-check.mjs', 'docs/cli-contract.md', 'package.json'],
        },
      ],
      blockers: [],
      recommendations: [],
    } satisfies GapReport;

    const plan = planner.plan(gap, 'harden CLI');
    const task = plan.tasks.find((t) => t.title === 'Add CLI executable contract harness');

    expect(task).toBeTruthy();
    expect(task?.expected_changed_files).toContain('scripts/cli-contract-check.mjs');
    expect(task?.verification_commands).toContain('node scripts/cli-contract-check.mjs');
  });

  it('plans non-UI productization harnesses for API, config, data and workers', () => {
    const planner = new PlannerAgent();
    const gap = {
      project_snapshot: {
        project_path: '/tmp/service-demo',
        detected_language: 'javascript',
        detected_frameworks: ['express'],
        package_manager: 'npm',
        test_commands: ['npm test'],
        build_commands: ['npm run build'],
        start_commands: [],
        important_files: ['package.json', 'src/server.js'],
        missing_files: [],
        dependency_summary: { runtime: 3, dev: 1, has_lockfile: true },
        timestamp: new Date(0).toISOString(),
      },
      score: { total: 70, grade: 'project_ready_candidate', breakdown: {} as never, notes: [] },
      findings: [
        {
          id: 'gap-api',
          category: 'missing_api_contract_harness',
          severity: 'high',
          message: 'api',
          why_it_matters: '',
          suggested_fix: '',
          related_files: [],
        },
        {
          id: 'gap-config',
          category: 'missing_config_contract_harness',
          severity: 'medium',
          message: 'config',
          why_it_matters: '',
          suggested_fix: '',
          related_files: [],
        },
        {
          id: 'gap-data',
          category: 'missing_data_migration_harness',
          severity: 'medium',
          message: 'data',
          why_it_matters: '',
          suggested_fix: '',
          related_files: [],
        },
        {
          id: 'gap-worker',
          category: 'missing_worker_contract_harness',
          severity: 'medium',
          message: 'worker',
          why_it_matters: '',
          suggested_fix: '',
          related_files: [],
        },
      ],
      blockers: [],
      recommendations: [],
    } satisfies GapReport;

    const plan = planner.plan(gap, 'add product harnesses');
    expect(plan.tasks.map((t) => t.title)).toEqual([
      'Add API contract harness',
      'Add config contract harness',
      'Add data migration contract harness',
      'Add worker contract harness',
    ]);
    expect(plan.tasks.map((t) => t.verification_commands[0])).toEqual([
      'node scripts/api-contract-check.mjs',
      'node scripts/config-contract-check.mjs',
      'node scripts/data-contract-check.mjs',
      'node scripts/worker-contract-check.mjs',
    ]);
  });

  it('plans one consolidated UI hardening task for common UI implementation risks', () => {
    const planner = new PlannerAgent();
    const gap = {
      project_snapshot: {
        project_path: '/tmp/ui-demo',
        detected_language: 'javascript',
        detected_frameworks: ['vue'],
        package_manager: 'npm',
        test_commands: ['npm test'],
        build_commands: ['npm run build'],
        start_commands: ['npm run dev'],
        important_files: ['src/App.vue', 'src/style.css'],
        missing_files: [],
        dependency_summary: { runtime: 2, dev: 2, has_lockfile: true },
        timestamp: new Date(0).toISOString(),
      },
      score: { total: 76, grade: 'project_ready_candidate', breakdown: {} as never, notes: [] },
      findings: [
        {
          id: 'gap-hover',
          category: 'ui_pointer_only_interaction',
          severity: 'high',
          message: 'hover only',
          why_it_matters: '',
          suggested_fix: '',
          related_files: ['src/App.vue'],
        },
        {
          id: 'gap-copy',
          category: 'ui_placeholder_copy',
          severity: 'medium',
          message: 'placeholder copy',
          why_it_matters: '',
          suggested_fix: '',
          related_files: ['src/App.vue'],
        },
      ],
      blockers: [],
      recommendations: [],
    } satisfies GapReport;

    const plan = planner.plan(gap, 'harden UI');
    const tasks = plan.tasks.filter((t) => t.title === 'Harden UI interaction, accessibility and polish');

    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.verification_commands).toEqual(['npm run build']);
    expect(tasks[0]?.acceptance_criteria.join('\n')).toContain('keyboard and touch');
  });
});
