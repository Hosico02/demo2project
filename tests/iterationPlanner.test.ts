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
          suggested_fix: 'Recent verification output:\nAssertionError: config contract omitted WW_ALLOW_SERVER_LLM_KEY_FALLBACK',
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
    expect(repair?.description).toContain('WW_ALLOW_SERVER_LLM_KEY_FALLBACK');
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

  it('plans Python product core verification for Python demo shells', () => {
    const planner = new PlannerAgent();
    const gap = {
      project_snapshot: {
        project_path: '/tmp/python-demo',
        detected_language: 'python',
        detected_frameworks: ['flask'],
        package_manager: 'pip',
        test_commands: ['python3 -m pytest -q'],
        build_commands: [],
        start_commands: ['python3 app.py'],
        important_files: ['README.md', 'app.py', 'requirements.txt', 'tests'],
        missing_files: [],
        dependency_summary: { runtime: 0, dev: 0, has_lockfile: false },
        timestamp: new Date(0).toISOString(),
      },
      score: { total: 79, grade: 'project_ready_candidate', breakdown: {} as never, notes: [] },
      findings: [
        {
          id: 'gap-product-core',
          category: 'demo_shell_without_product_core',
          severity: 'high',
          message: 'Productization only added a shell',
          why_it_matters: '',
          suggested_fix: '',
          related_files: ['src/product_core.py', 'tests/test_product_core.py'],
        },
      ],
      blockers: [],
      recommendations: [],
    } satisfies GapReport;

    const plan = planner.plan(gap, 'add product core');
    const task = plan.tasks.find((t) => t.title === 'Implement product core spine');

    expect(task).toBeTruthy();
    expect(task?.expected_changed_files).toContain('src/product_core.py');
    expect(task?.expected_changed_files).toContain('tests/test_product_core.py');
    expect(task?.verification_commands).toEqual(['python3 -m pytest tests/test_product_core.py -q']);
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
    const task = plan.tasks.find((t) => t.title === 'Implement social deduction product backbone');

    expect(task).toBeTruthy();
    expect(task?.expected_changed_files).toContain('accounts.py');
    expect(task?.expected_changed_files).toContain('tests/test_product_backbone.py');
    expect(task?.expected_changed_files).toContain('docs/market-parity.md');
    expect(task?.acceptance_criteria.join('\n')).toContain('market parity');
  });

  it('plans agent-facing werewolf product work without pivoting to human multiplayer features', () => {
    const planner = new PlannerAgent();
    const gap = {
      project_snapshot: {
        project_path: '/tmp/werewolf-agent-demo',
        detected_language: 'python',
        detected_frameworks: ['flask', 'pytest'],
        package_manager: 'pip',
        test_commands: ['python3 -m pytest -q'],
        build_commands: [],
        start_commands: ['python3 app.py'],
        important_files: ['README.md', 'app.py', 'game.py', 'player.py', 'prompts.py'],
        missing_files: [],
        dependency_summary: { runtime: 0, dev: 0, has_lockfile: true },
        timestamp: new Date(0).toISOString(),
      },
      score: { total: 100, grade: 'production_ready_baseline', breakdown: {} as never, notes: [] },
      findings: [
        {
          id: 'gap-agent-market',
          category: 'below_agent_social_deduction_theater_maturity',
          severity: 'medium',
          message: 'Below agent-facing theater maturity',
          why_it_matters: '',
          suggested_fix: '',
          related_files: ['docs/agent-product.md'],
        },
      ],
      blockers: [],
      recommendations: [],
      product_maturity: {
        domain: 'agent_social_deduction_theater',
        target_market: 'mature agent-facing werewolf simulation and observer product',
        score: 30,
        level: 'engineering_baseline',
        summary: '3/10 capabilities',
        capabilities: [],
        missing_capabilities: ['Per-session agent model and provider configuration'],
        references: [],
      },
    } satisfies GapReport;

    const plan = planner.plan(gap, 'keep the agent-facing werewolf premise and make it product-grade');
    const task = plan.tasks.find((t) => t.title === 'Harden agent-facing werewolf product loop');

    expect(task).toBeTruthy();
    expect(task?.expected_changed_files).toContain('llm_config.py');
    expect(task?.expected_changed_files).toContain('evaluation.py');
    expect(task?.expected_changed_files).toContain('docs/agent-product.md');
    expect(task?.expected_changed_files).not.toContain('accounts.py');
    expect(task?.acceptance_criteria.join('\n')).toContain('per-session model provider');
    expect(task?.acceptance_criteria.join('\n')).toContain('human multiplayer');
  });

  it('plans runtime integration when social product backbone is disconnected', () => {
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
        important_files: ['README.md', 'app.py', 'templates/index.html'],
        missing_files: [],
        dependency_summary: { runtime: 0, dev: 0, has_lockfile: true },
        timestamp: new Date(0).toISOString(),
      },
      score: { total: 80, grade: 'project_ready_candidate', breakdown: {} as never, notes: [] },
      findings: [
        {
          id: 'gap-disconnected',
          category: 'disconnected_social_product_backbone',
          severity: 'high',
          message: 'Social product backbone modules are disconnected from the running app',
          why_it_matters: '',
          suggested_fix: '',
          related_files: ['app.py', 'accounts.py', 'lobby.py', 'tests/test_product_backbone.py'],
        },
      ],
      blockers: [],
      recommendations: [],
    } satisfies GapReport;

    const plan = planner.plan(gap, 'make the product workflow actually usable');
    const task = plan.tasks.find((t) => t.title === 'Integrate social product backbone into app workflows');

    expect(task).toBeTruthy();
    expect(task?.expected_changed_files).toContain('app.py');
    expect(task?.expected_changed_files).toContain('tests/test_product_integration.py');
    expect(task?.verification_commands).toContain('python3 -m pytest tests/test_product_integration.py -q');
  });

  it('plans a source-cited market research roadmap from dynamic competitor gaps', () => {
    const planner = new PlannerAgent();
    const gap = {
      project_snapshot: {
        project_path: '/tmp/ui-demo',
        detected_language: 'javascript',
        detected_frameworks: ['vue'],
        package_manager: 'pnpm',
        test_commands: ['pnpm test'],
        build_commands: ['pnpm build'],
        start_commands: ['pnpm dev'],
        important_files: ['README.md', 'src/App.vue'],
        missing_files: [],
        dependency_summary: { runtime: 1, dev: 1, has_lockfile: true },
        timestamp: new Date(0).toISOString(),
      },
      score: { total: 100, grade: 'production_ready_baseline', breakdown: {} as never, notes: [] },
      findings: [{
        id: 'gap-market-research',
        category: 'below_market_research_parity',
        severity: 'medium',
        message: 'Below source-cited market parity',
        why_it_matters: '',
        suggested_fix: '',
        related_files: ['.demo2project/research/latest.json', 'docs/market-research-roadmap.md'],
      }],
      blockers: [],
      recommendations: [],
    } satisfies GapReport;

    const plan = planner.plan(gap, 'use competitor research to productize UI');
    const task = plan.tasks.find((t) => t.title === 'Define source-cited market research roadmap');

    expect(task).toBeTruthy();
    expect(task?.expected_changed_files).toContain('docs/market-research-roadmap.md');
    expect(task?.acceptance_criteria.join('\n')).toContain('source-cited');
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

  it('plans LLM provider select contract repair when option labels render empty', () => {
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
        important_files: ['app.py', 'llm_config.py', 'templates/index.html'],
        missing_files: [],
        dependency_summary: { runtime: 0, dev: 0, has_lockfile: true },
        timestamp: new Date(0).toISOString(),
      },
      score: { total: 79, grade: 'project_ready_candidate', breakdown: {} as never, notes: [] },
      findings: [
        {
          id: 'gap-empty-provider-select',
          category: 'broken_llm_provider_select_options',
          severity: 'high',
          message: 'LLM provider select renders empty option labels',
          why_it_matters: '',
          suggested_fix: '',
          related_files: ['llm_config.py', 'templates/index.html'],
        },
      ],
      blockers: [],
      recommendations: [],
    } satisfies GapReport;

    const plan = planner.plan(gap, 'fix blank provider options');
    const task = plan.tasks.find((t) => t.title === 'Repair LLM provider select option labels');

    expect(task).toBeTruthy();
    expect(task?.expected_changed_files).toContain('llm_config.py');
    expect(task?.expected_changed_files).toContain('templates/index.html');
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

  it('plans a runnable product entry when specialized surfaces only have contracts', () => {
    const planner = new PlannerAgent();
    const gap = {
      project_snapshot: {
        project_path: '/tmp/game-demo',
        detected_language: 'javascript',
        detected_frameworks: [],
        package_manager: 'npm',
        test_commands: ['npm test'],
        build_commands: ['npm run build'],
        start_commands: [],
        important_files: ['package.json', 'src'],
        missing_files: [],
        dependency_summary: { runtime: 1, dev: 0, has_lockfile: false },
        timestamp: new Date(0).toISOString(),
      },
      score: { total: 84, grade: 'project_ready_candidate', breakdown: {} as never, notes: [] },
      findings: [
        {
          id: 'gap-runtime',
          category: 'missing_product_runtime_entry',
          severity: 'high',
          message: 'Specialized product surface has no runnable entry',
          why_it_matters: '',
          suggested_fix: '',
          related_files: ['package.json', 'index.html'],
        },
      ],
      blockers: [],
      recommendations: [],
    } satisfies GapReport;

    const plan = planner.plan(gap, 'make surface runnable');
    const task = plan.tasks.find((t) => t.title === 'Add product runtime entry');

    expect(task).toBeTruthy();
    expect(task?.expected_changed_files).toContain('package.json');
    expect(task?.verification_commands).toContain('node scripts/product-runtime-check.mjs');
  });

  it('does not starve surface and contract harnesses behind generic demo chores', () => {
    const planner = new PlannerAgent();
    const base = {
      severity: 'medium' as const,
      why_it_matters: '',
      suggested_fix: '',
      related_files: [],
    };
    const gap = {
      project_snapshot: {
        project_path: '/tmp/mixed-demo',
        detected_language: 'javascript',
        detected_frameworks: ['vue'],
        package_manager: 'npm',
        test_commands: [],
        build_commands: [],
        start_commands: [],
        important_files: ['package.json', 'src/App.vue', 'bin/demo.js', 'src/game.js'],
        missing_files: [],
        dependency_summary: { runtime: 3, dev: 0, has_lockfile: false },
        timestamp: new Date(0).toISOString(),
      },
      score: { total: 23, grade: 'raw_demo', breakdown: {} as never, notes: [] },
      findings: [
        { ...base, id: 'gap-test-command', category: 'missing_required_command', severity: 'blocker' as const, message: 'Missing required command: test' },
        { ...base, id: 'gap-no-tests', category: 'no_tests', severity: 'high' as const, message: 'No tests' },
        { ...base, id: 'gap-readme-file', category: 'missing_required_file', severity: 'high' as const, message: 'Missing README.md' },
        { ...base, id: 'gap-readme', category: 'missing_readme', message: 'Missing README' },
        { ...base, id: 'gap-ui', category: 'missing_ui_product_verification', message: 'UI harness missing' },
        { ...base, id: 'gap-cli', category: 'missing_cli_contract_harness', message: 'CLI harness missing' },
        { ...base, id: 'gap-surface', category: 'missing_demo_surface_contract_matrix', message: 'Surface matrix missing' },
        { ...base, id: 'gap-game', category: 'missing_game_contract_harness', message: 'Game harness missing' },
      ],
      blockers: [],
      recommendations: [],
    } satisfies GapReport;

    const plan = planner.plan(gap, 'mixed demo productization');

    expect(plan.tasks.map((task) => task.title)).toEqual([
      'Add UI product verification harness',
      'Add CLI executable contract harness',
      'Add demo surface contract matrix',
      'Add game runtime contract harness',
    ]);
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

  it('plans a generalized demo surface contract matrix for specialized demo types', () => {
    const planner = new PlannerAgent();
    const gap = {
      project_snapshot: {
        project_path: '/tmp/extension-demo',
        detected_language: 'javascript',
        detected_frameworks: [],
        package_manager: 'unknown',
        test_commands: [],
        build_commands: [],
        start_commands: [],
        important_files: ['manifest.json', 'popup.html'],
        missing_files: [],
        dependency_summary: { runtime: 0, dev: 0, has_lockfile: false },
        timestamp: new Date(0).toISOString(),
      },
      score: { total: 55, grade: 'structured_prototype', breakdown: {} as never, notes: [] },
      findings: [{
        id: 'gap-surface',
        category: 'missing_demo_surface_contract_matrix',
        severity: 'medium',
        message: 'specialized surface',
        why_it_matters: '',
        suggested_fix: '',
        related_files: ['docs/productization-surface-map.md', 'scripts/surface-contract-check.mjs'],
      }],
      blockers: [],
      recommendations: [],
    } satisfies GapReport;

    const plan = planner.plan(gap, 'generalize demo productization');
    const task = plan.tasks.find((t) => t.title === 'Add demo surface contract matrix');

    expect(task?.expected_changed_files).toContain('docs/productization-surface-map.md');
    expect(task?.verification_commands).toContain('node scripts/surface-contract-check.mjs');
  });

  it('plans dedicated contract harnesses for specialized demo surfaces', () => {
    const planner = new PlannerAgent();
    const gap = {
      project_snapshot: {
        project_path: '/tmp/specialized-demo',
        detected_language: 'javascript',
        detected_frameworks: [],
        package_manager: 'npm',
        test_commands: [],
        build_commands: [],
        start_commands: [],
        important_files: ['manifest.json', 'analysis.ipynb', 'app.json', 'electron.js'],
        missing_files: [],
        dependency_summary: { runtime: 0, dev: 0, has_lockfile: false },
        timestamp: new Date(0).toISOString(),
      },
      score: { total: 55, grade: 'structured_prototype', breakdown: {} as never, notes: [] },
      findings: [
        {
          id: 'gap-extension',
          category: 'missing_browser_extension_contract_harness',
          severity: 'medium',
          message: 'extension',
          why_it_matters: '',
          suggested_fix: '',
          related_files: [],
        },
        {
          id: 'gap-notebook',
          category: 'missing_notebook_contract_harness',
          severity: 'medium',
          message: 'notebook',
          why_it_matters: '',
          suggested_fix: '',
          related_files: [],
        },
        {
          id: 'gap-mobile',
          category: 'missing_mobile_contract_harness',
          severity: 'medium',
          message: 'mobile',
          why_it_matters: '',
          suggested_fix: '',
          related_files: [],
        },
        {
          id: 'gap-desktop',
          category: 'missing_desktop_contract_harness',
          severity: 'medium',
          message: 'desktop',
          why_it_matters: '',
          suggested_fix: '',
          related_files: [],
        },
      ],
      blockers: [],
      recommendations: [],
    } satisfies GapReport;

    const plan = planner.plan(gap, 'specialized demo productization');
    expect(plan.tasks.map((task) => task.title)).toEqual([
      'Add browser extension contract harness',
      'Add notebook reproducibility contract harness',
      'Add mobile app contract harness',
      'Add desktop app contract harness',
    ]);
    expect(plan.tasks.map((task) => task.verification_commands[0])).toEqual([
      'node scripts/browser-extension-contract-check.mjs',
      'node scripts/notebook-contract-check.mjs',
      'node scripts/mobile-contract-check.mjs',
      'node scripts/desktop-contract-check.mjs',
    ]);
  });

  it('plans dedicated contract harnesses for game, 3D, ML and media demos', () => {
    const planner = new PlannerAgent();
    const gap = {
      project_snapshot: {
        project_path: '/tmp/rich-demo',
        detected_language: 'javascript',
        detected_frameworks: [],
        package_manager: 'npm',
        test_commands: [],
        build_commands: [],
        start_commands: [],
        important_files: ['src/game.js', 'src/scene.js', 'model.onnx', 'src/process-media.js'],
        missing_files: [],
        dependency_summary: { runtime: 0, dev: 0, has_lockfile: false },
        timestamp: new Date(0).toISOString(),
      },
      score: { total: 55, grade: 'structured_prototype', breakdown: {} as never, notes: [] },
      findings: [
        {
          id: 'gap-game',
          category: 'missing_game_contract_harness',
          severity: 'medium',
          message: 'game',
          why_it_matters: '',
          suggested_fix: '',
          related_files: [],
        },
        {
          id: 'gap-3d',
          category: 'missing_3d_scene_contract_harness',
          severity: 'medium',
          message: '3d',
          why_it_matters: '',
          suggested_fix: '',
          related_files: [],
        },
        {
          id: 'gap-ml',
          category: 'missing_ml_model_contract_harness',
          severity: 'medium',
          message: 'ml',
          why_it_matters: '',
          suggested_fix: '',
          related_files: [],
        },
        {
          id: 'gap-media',
          category: 'missing_media_pipeline_contract_harness',
          severity: 'medium',
          message: 'media',
          why_it_matters: '',
          suggested_fix: '',
          related_files: [],
        },
      ],
      blockers: [],
      recommendations: [],
    } satisfies GapReport;

    const plan = planner.plan(gap, 'rich demo productization');
    expect(plan.tasks.map((task) => task.title)).toEqual([
      'Add game runtime contract harness',
      'Add 3D scene contract harness',
      'Add ML model contract harness',
      'Add media pipeline contract harness',
    ]);
    expect(plan.tasks.map((task) => task.verification_commands[0])).toEqual([
      'node scripts/game-contract-check.mjs',
      'node scripts/3d-scene-contract-check.mjs',
      'node scripts/ml-model-contract-check.mjs',
      'node scripts/media-pipeline-contract-check.mjs',
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

  it('plans a dedicated task for unimplemented hosted service claims', () => {
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
        important_files: ['src/App.vue'],
        missing_files: [],
        dependency_summary: { runtime: 2, dev: 2, has_lockfile: true },
        timestamp: new Date(0).toISOString(),
      },
      score: { total: 76, grade: 'project_ready_candidate', breakdown: {} as never, notes: [] },
      findings: [
        {
          id: 'gap-service-claim',
          category: 'ui_unimplemented_hosted_service_claim',
          severity: 'high',
          message: 'hosted service claim',
          why_it_matters: '',
          suggested_fix: '',
          related_files: ['src/App.vue'],
        },
      ],
      blockers: [],
      recommendations: [],
    } satisfies GapReport;

    const plan = planner.plan(gap, 'align product claims');
    const task = plan.tasks[0];

    expect(task?.title).toBe('Align UI service claims with implemented backend');
    expect(task?.verification_commands).toEqual(['npm run build']);
    expect(task?.acceptance_criteria.join('\n')).toContain('hosted upload');
  });
});
