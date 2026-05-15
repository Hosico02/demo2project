import type {
  ProjectSnapshot,
  ProjectScore,
  ProjectStandard,
  GapReport,
  GapFinding,
  AgentMisjudgmentAudit,
  ProductMaturityAssessment,
  Severity,
} from './types.js';
import { DEFAULT_PROJECT_STANDARD } from '../standards/defaultProjectStandard.js';
import { listFiles, readTextSafe } from '../utils/fs.js';
import { readJsonSafe } from '../utils/json.js';
import path from 'node:path';
import { shortId } from '../utils/time.js';
import { evaluateScoreGate } from './scoreGate.js';
import { gradeProjectScore } from './projectScorer.js';
import { loadMarketResearchReport } from '../research/MarketResearchAgent.js';
import { analyzeMarketResearchGaps } from './marketGapAnalyzer.js';
import { loadOfficialModelCatalog, type OfficialModelCatalog } from '../research/OfficialModelCatalog.js';
import { detectDeliverySurfaces, requiresSurfaceContractMatrix } from './deliverySurfaceDetector.js';

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
  let productMaturity: ProductMaturityAssessment | undefined;
  const files = await listFiles(snapshot.project_path);
  const has = (rel: string): boolean =>
    files.includes(rel) || files.some((f) => f.startsWith(rel + '/'));
  const pkg = await readJsonSafe<{
    bin?: unknown;
    main?: string;
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }>(
    path.join(snapshot.project_path, 'package.json'),
  );
  const scripts = pkg?.scripts ?? {};
  const hasPythonTestFile = files.some((f) => /(^|\/)test_[^/]+\.py$/.test(f) || /_test\.py$/.test(f));
  const hasAnyTestFile = files.some(
    (f) =>
      /\.(test|spec)\.(ts|tsx|js|jsx|py|mjs|cjs)$/.test(f) ||
      /(^|\/)tests?\//.test(f),
  );

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
    if (snapshot.detected_language === 'python' && rec === 'tests' && !hasPythonTestFile) {
      continue;
    }
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
  const requiredCommands = new Set(standard.required_commands);
  if (
    snapshot.package_manager !== 'unknown' &&
    snapshot.detected_language !== 'python' &&
    files.some((f) => /\.(mjs|cjs|js|jsx|ts|tsx)$/.test(f) && !/(^|\/)(tests?|docs?|scripts?)\//.test(f))
  ) {
    requiredCommands.add('test');
    requiredCommands.add('build');
  }

  for (const req of requiredCommands) {
    if (snapshot.detected_language === 'python' && req === 'pytest' && !hasPythonTestFile) {
      continue;
    }
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
  if (!hasAnyTestFile && snapshot.detected_language !== 'python') {
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
  if (
    snapshot.detected_language === 'python' &&
    !hasPythonTestFile
  ) {
    findings.push(
      finding(
        'no_python_tests',
        'high',
        'No Python tests found',
        'Python projects need a cheap deterministic test command before model-driven iteration is safe.',
        'Add tests/test_smoke.py and a pytest-compatible smoke test.',
        ['tests/test_smoke.py'],
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
  if (snapshot.detected_language === 'python' && has('.github/workflows')) {
    const workflowFiles = files.filter((f) => f.startsWith('.github/workflows/') && /\.(ya?ml)$/.test(f));
    const workflowText = (await Promise.all(
      workflowFiles.map((f) => readTextSafe(path.join(snapshot.project_path, f))),
    )).join('\n');
    if (!/setup-python|python\s+-m\s+pytest|pytest|pip\s+install/i.test(workflowText)) {
      findings.push(
        finding(
          'misaligned_ci',
          'medium',
          'CI workflow does not validate the Python project',
          'A Node-only workflow gives false confidence for a Python/Flask demo.',
          'Update CI to install Python dependencies and run pytest.',
          workflowFiles.length > 0 ? workflowFiles : ['.github/workflows/ci.yml'],
        ),
      );
    }
  }
  if (
    scripts.build &&
    (
      /(^|\s)(echo|printf)\b.*\b(build ok|ok)\b/i.test(scripts.build) ||
      /\bnode\s+-e\b.*console\.log\([^)]*(build ok|ok)/i.test(scripts.build)
    )
  ) {
    findings.push(
      finding(
        'fake_build_command',
        'medium',
        'Build command is echo-only',
        'Echo-only build scripts inflate readiness without validating source code.',
        'Replace the build script with a real compile/typecheck command.',
        ['package.json'],
      ),
    );
  }
  if (
    snapshot.detected_language === 'python' &&
    Object.keys(scripts).length > 0 &&
    Object.entries(scripts)
      .filter(([key, script]) => !isAllowedCrossRuntimeHarnessScript(key, script))
      .some(([, s]) => /\bnode\b|npm\b|tsc\b/.test(s))
  ) {
    findings.push(
      finding(
        'misaligned_node_scaffold',
        'medium',
        'Node package scripts are misaligned with the Python project',
        'A Python/Flask project should validate Python sources, not placeholder Node scripts.',
        'Point npm compatibility scripts at Python smoke tests or remove the scaffold.',
        ['package.json'],
      ),
    );
  }
  const singleFileDemoEntry = detectSingleFileDemoEntry(files);
  if (singleFileDemoEntry && !hasSingleFileDemoIntakeHarness(files, scripts)) {
    findings.push(
      finding(
        'single_file_demo_without_intake_harness',
        'high',
        'Single-file demo lacks an intake/runtime contract harness',
        'When the starting point is one demo file, d2p needs a stable entry contract before it can safely expand the project around tests, docs, packaging and deployment.',
        'Add docs/demo-intake.md and scripts/demo-runtime-check.mjs to capture the entry file, inferred runtime and deterministic pre-productization checks.',
        [singleFileDemoEntry, 'docs/demo-intake.md', 'scripts/demo-runtime-check.mjs', 'package.json'],
      ),
    );
  }
  if (isCliProject(files, pkg) && !hasCliContractHarness(files, scripts)) {
    findings.push(
      finding(
        'missing_cli_contract_harness',
        'medium',
        'CLI project lacks an executable contract harness',
        'Product CLI projects need more than syntax checks: the installed entrypoint should expose a stable --help contract and fail deterministically when the entry breaks.',
        'Add scripts/cli-contract-check.mjs, docs/cli-contract.md and a cli:contract-check package script that invokes the CLI entry with --help.',
        ['scripts/cli-contract-check.mjs', 'docs/cli-contract.md', 'package.json'],
      ),
    );
  }

  const appPy = (await readTextSafe(path.join(snapshot.project_path, 'app.py'))) ?? '';
  const gameText = (await readTextSafe(path.join(snapshot.project_path, 'game.py'))) ?? '';
  const configText = (await readTextSafe(path.join(snapshot.project_path, 'config.py'))) ?? '';
  const playerText = (await readTextSafe(path.join(snapshot.project_path, 'player.py'))) ?? '';
  const projectSurfaceText = await readProjectSurfaceText(snapshot.project_path, files);
  const templateFiles = files.filter((f) => /^templates\/.*\.(html|jinja2?)$/.test(f));
  const templateText = (await Promise.all(
    templateFiles.map((f) => readTextSafe(path.join(snapshot.project_path, f))),
  )).join('\n');
  const requirementsText = (await readTextSafe(path.join(snapshot.project_path, 'requirements.txt'))) ?? '';
  const llmConfigText = (await readTextSafe(path.join(snapshot.project_path, 'llm_config.py'))) ?? '';
  const pyprojectText = (await readTextSafe(path.join(snapshot.project_path, 'pyproject.toml'))) ?? '';
  const constraintsText = (await readTextSafe(path.join(snapshot.project_path, 'constraints.txt'))) ?? '';
  if (isApiBearingProject(snapshot, files, pkg, projectSurfaceText) && !hasApiContractHarness(files, scripts)) {
    findings.push(
      finding(
        'missing_api_contract_harness',
        'high',
        'API project lacks a contract/runtime harness',
        'API demos often pass syntax checks while their public route contract, health behavior and request/response surface remain unverified.',
        'Add docs/api-contract.md, scripts/api-contract-check.mjs and an api:contract-check script that proves an API surface exists and is covered by a stable contract.',
        ['docs/api-contract.md', 'scripts/api-contract-check.mjs', 'package.json'],
      ),
    );
  }
  const envVarNames = detectEnvVars(projectSurfaceText);
  if (envVarNames.length > 0 && !hasConfigContractHarness(files, scripts)) {
    findings.push(
      finding(
        'missing_config_contract_harness',
        'medium',
        'Environment configuration lacks a contract harness',
        'Productized demos need a deterministic check that every required environment variable is documented and safe defaults are explicit.',
        'Add docs/config-contract.md, scripts/config-contract-check.mjs and a config:contract-check script that compares source env usage with .env.example.',
        ['docs/config-contract.md', 'scripts/config-contract-check.mjs', '.env.example', 'package.json'],
      ),
    );
  }
  if (isDataBearingProject(files, pkg, projectSurfaceText) && !hasDataContractHarness(files, scripts)) {
    findings.push(
      finding(
        'missing_data_migration_harness',
        'medium',
        'Data layer lacks a schema/migration harness',
        'Database demos need an explicit migration and schema boundary before d2p can safely add features that persist state.',
        'Add docs/data-contract.md, scripts/data-contract-check.mjs and a data:contract-check script that verifies schema or migration evidence exists.',
        ['docs/data-contract.md', 'scripts/data-contract-check.mjs', 'package.json'],
      ),
    );
  }
  if (isWorkerBearingProject(files, pkg, projectSurfaceText) && !hasWorkerContractHarness(files, scripts)) {
    findings.push(
      finding(
        'missing_worker_contract_harness',
        'medium',
        'Background worker lacks an executable contract harness',
        'Worker and scheduled-job demos can look complete while retry, entrypoint and queue boundaries remain untestable.',
        'Add docs/worker-contract.md, scripts/worker-contract-check.mjs and a worker:contract-check script that validates worker entry evidence.',
        ['docs/worker-contract.md', 'scripts/worker-contract-check.mjs', 'package.json'],
      ),
    );
  }
  const deliverySurfaces = detectDeliverySurfaces({ snapshot, files, pkg, sourceText: projectSurfaceText });
  const deliverySurfaceIds = deliverySurfaces.map((surface) => surface.id);
  if (requiresSurfaceContractMatrix(deliverySurfaces) && !hasDemoSurfaceContractMatrix(files, scripts)) {
    findings.push(
      finding(
        'missing_demo_surface_contract_matrix',
        'medium',
        'Specialized demo surfaces lack a productization surface contract',
        'Browser extensions, notebooks, mobile shells and desktop shells need explicit surface boundaries before agents safely generalize them into products. Without that map, d2p can apply the wrong UI/API/CLI assumptions.',
        'Add docs/productization-surface-map.md, scripts/surface-contract-check.mjs and a surface:contract-check script that records detected delivery surfaces and verifies their minimum evidence.',
        ['docs/productization-surface-map.md', 'scripts/surface-contract-check.mjs', 'package.json'],
      ),
    );
  }
  if (deliverySurfaces.some((surface) => surface.id === 'browser_extension') && !hasSpecializedSurfaceHarness(files, scripts, 'browser-extension', 'extension')) {
    findings.push(
      finding(
        'missing_browser_extension_contract_harness',
        'medium',
        'Browser extension demo lacks a manifest and permission contract harness',
        'Extension demos need explicit manifest, popup/background/content and permission boundaries before productization changes are safe.',
        'Add docs/browser-extension-contract.md, scripts/browser-extension-contract-check.mjs and an extension:contract-check script.',
        ['docs/browser-extension-contract.md', 'scripts/browser-extension-contract-check.mjs', 'package.json'],
      ),
    );
  }
  if (deliverySurfaces.some((surface) => surface.id === 'notebook') && !hasSpecializedSurfaceHarness(files, scripts, 'notebook', 'notebook')) {
    findings.push(
      finding(
        'missing_notebook_contract_harness',
        'medium',
        'Notebook demo lacks a reproducibility contract harness',
        'Notebook demos need parseability and script-conversion boundaries so results are repeatable outside an interactive session.',
        'Add docs/notebook-contract.md, scripts/notebook-contract-check.mjs and a notebook:contract-check script.',
        ['docs/notebook-contract.md', 'scripts/notebook-contract-check.mjs', 'package.json'],
      ),
    );
  }
  if (deliverySurfaces.some((surface) => surface.id === 'mobile_app') && !hasSpecializedSurfaceHarness(files, scripts, 'mobile', 'mobile')) {
    findings.push(
      finding(
        'missing_mobile_contract_harness',
        'medium',
        'Mobile app demo lacks a platform contract harness',
        'Mobile shells need explicit Expo/React Native/Capacitor platform evidence before agents safely expand screens and packaging.',
        'Add docs/mobile-contract.md, scripts/mobile-contract-check.mjs and a mobile:contract-check script.',
        ['docs/mobile-contract.md', 'scripts/mobile-contract-check.mjs', 'package.json'],
      ),
    );
  }
  if (deliverySurfaces.some((surface) => surface.id === 'desktop_app') && !hasSpecializedSurfaceHarness(files, scripts, 'desktop', 'desktop')) {
    findings.push(
      finding(
        'missing_desktop_contract_harness',
        'medium',
        'Desktop app demo lacks a shell contract harness',
        'Electron/Tauri demos need explicit shell entry and desktop security boundary checks before UI productization work.',
        'Add docs/desktop-contract.md, scripts/desktop-contract-check.mjs and a desktop:contract-check script.',
        ['docs/desktop-contract.md', 'scripts/desktop-contract-check.mjs', 'package.json'],
      ),
    );
  }
  if (deliverySurfaces.some((surface) => surface.id === 'game_demo') && !hasSpecializedSurfaceHarness(files, scripts, 'game', 'game')) {
    findings.push(
      finding(
        'missing_game_contract_harness',
        'medium',
        'Game demo lacks a runtime contract harness',
        'Game demos need explicit loop, input and asset boundaries before agents safely add mechanics, levels or production UX.',
        'Add docs/game-contract.md, scripts/game-contract-check.mjs and a game:contract-check script.',
        ['docs/game-contract.md', 'scripts/game-contract-check.mjs', 'package.json'],
      ),
    );
  }
  if (deliverySurfaces.some((surface) => surface.id === 'three_d_scene') && !hasSpecializedSurfaceHarness(files, scripts, '3d-scene', '3d')) {
    findings.push(
      finding(
        'missing_3d_scene_contract_harness',
        'medium',
        '3D scene demo lacks a renderer contract harness',
        '3D/WebGL demos can look visually broken while builds pass; productization needs renderer, canvas and asset smoke checks.',
        'Add docs/3d-scene-contract.md, scripts/3d-scene-contract-check.mjs and a 3d:contract-check script.',
        ['docs/3d-scene-contract.md', 'scripts/3d-scene-contract-check.mjs', 'package.json'],
      ),
    );
  }
  if (deliverySurfaces.some((surface) => surface.id === 'ml_model') && !hasSpecializedSurfaceHarness(files, scripts, 'ml-model', 'ml')) {
    findings.push(
      finding(
        'missing_ml_model_contract_harness',
        'medium',
        'ML model demo lacks an inference contract harness',
        'ML demos need model/framework evidence and sample input/output boundaries before agents safely change UI, APIs or packaging.',
        'Add docs/ml-model-contract.md, scripts/ml-model-contract-check.mjs and an ml:contract-check script.',
        ['docs/ml-model-contract.md', 'scripts/ml-model-contract-check.mjs', 'package.json'],
      ),
    );
  }
  if (deliverySurfaces.some((surface) => surface.id === 'media_pipeline') && !hasSpecializedSurfaceHarness(files, scripts, 'media-pipeline', 'media')) {
    findings.push(
      finding(
        'missing_media_pipeline_contract_harness',
        'medium',
        'Media processing demo lacks a pipeline contract harness',
        'Media demos need explicit input/output format and fixture processing checks before agents safely expand batch, upload or export workflows.',
        'Add docs/media-pipeline-contract.md, scripts/media-pipeline-contract-check.mjs and a media:contract-check script.',
        ['docs/media-pipeline-contract.md', 'scripts/media-pipeline-contract-check.mjs', 'package.json'],
      ),
    );
  }
  if (
    needsProductCoreSpine(deliverySurfaceIds) &&
    hasAnyProductizationHarness(files, scripts) &&
    !hasProductCoreSpine(files, scripts)
  ) {
    findings.push(
      finding(
        'demo_shell_without_product_core',
        'high',
        'Productization only added a shell, not executable product behavior',
        'A productized demo cannot be mostly docs, scripts and harnesses. It needs a reachable product core with domain workflows, tests and an entry integration path.',
        'Add a tested product core spine under src/ and wire at least one runtime entry or command to it.',
        ['src/product-core.mjs', 'tests/product-core.test.mjs', 'docs/product-core.md', 'package.json'],
      ),
    );
  }
  if (
    needsRunnableProductEntry(deliverySurfaceIds) &&
    hasAnyProductizationHarness(files, scripts) &&
    hasProductCoreSpine(files, scripts) &&
    !hasRunnableProductEntry(deliverySurfaceIds, files, scripts)
  ) {
    findings.push(
      finding(
        'missing_product_runtime_entry',
        'high',
        'Specialized product surface has no runnable product entry',
        'A visual, mobile or desktop product cannot be treated as complete if users can only run contract checks and tests.',
        'Add a real runtime entry, start script and runtime-entry check for the detected product surface.',
        ['package.json', 'scripts/product-runtime-check.mjs', 'index.html', 'App.js'],
      ),
    );
  }
  if (
    needsSpecializedSurfaceDepth(deliverySurfaceIds) &&
    hasAnyProductizationHarness(files, scripts) &&
    hasProductCoreSpine(files, scripts) &&
    (
      !needsRunnableProductEntry(deliverySurfaceIds) ||
      hasRunnableProductEntry(deliverySurfaceIds, files, scripts)
    ) &&
    !(await hasSpecializedSurfaceDomainDepth(snapshot.project_path, deliverySurfaceIds, files))
  ) {
    findings.push(
      finding(
        'specialized_surface_shallow_product',
        'high',
        'Specialized product surface is still a shallow demo shell',
        'Contract harnesses and product-core scaffolds prove boundaries, but they do not prove domain behavior. A product needs real gameplay, scene, mobile, desktop, model, media, notebook or extension workflows that users can exercise.',
        'Add behavior-level product flows, fixtures or browser/runtime checks for the detected specialized surface instead of relying on placeholder runtime entries.',
        ['src', 'App.js', 'electron.js', 'tests', 'scripts/product-runtime-check.mjs'],
      ),
    );
  }
  if (snapshot.detected_language === 'python' && (requirementsText.trim() || pyprojectText.trim())) {
    const dependencySpecs = parsePythonDependencySpecs(requirementsText, pyprojectText);
    if (dependencySpecs.length > 0 && !hasPythonDependencyConstraintPolicy(files)) {
      findings.push(
        finding(
          'missing_python_dependency_constraints',
          'high',
          'Missing Python dependency constraints',
          'Python product installs should be reproducible enough to avoid surprise dependency drift between environments.',
          'Add constraints.txt or a lockfile and document installing with the constraint policy.',
          ['requirements.txt', 'constraints.txt', 'README.md'],
        ),
      );
    }
    const unconstrained = dependencySpecs.filter((spec) => !hasUpperBound(spec) && !constraintTextBoundsDependency(constraintsText, spec));
    if (unconstrained.length > 0) {
      findings.push(
        finding(
          'unbounded_python_dependencies',
          'high',
          'Python dependencies are not bounded by upper constraints',
          'Lower-bound-only dependencies can silently pull breaking major versions in production deployments.',
          `Add upper bounds in constraints.txt for: ${unconstrained.map(dependencyName).join(', ')}.`,
          ['requirements.txt', 'constraints.txt', 'pyproject.toml'],
        ),
      );
    }
  }
  const isFlaskApp =
    snapshot.detected_language === 'python' &&
    (snapshot.detected_frameworks.includes('flask') || /\bfrom\s+flask\s+import\b|\bFlask\s*\(/.test(appPy));
  if (isFlaskApp) {
    const testFiles = files.filter((f) => /(^|\/)tests?\/.*\.py$/.test(f));
    const testTexts = await Promise.all(testFiles.map((f) => readTextSafe(path.join(snapshot.project_path, f))));
    const hasApiTests = testTexts.some((txt) => !!txt && /test_client\(|\/healthz|\/modes|\/start/.test(txt));
    const hasStartRoute = /@app\.(?:route|post)\(\s*['"]\/start['"]/.test(appPy);
    const productionDeps = `${requirementsText}\n${pyprojectText}`;

    if (!/\/healthz|\/health/.test(appPy)) {
      findings.push(
        finding(
          'missing_healthcheck',
          'high',
          'Missing health check endpoint',
          'Public demo deployments need a cheap endpoint for platform health checks and smoke probes.',
          'Add /healthz returning service status without touching the LLM provider.',
          ['app.py'],
        ),
      );
    }
    if (hasStartRoute && !hasFlaskStartConfigGuard(appPy)) {
      findings.push(
        finding(
          'missing_config_guard',
          'high',
          'Start route does not guard missing LLM API key',
          'Public users need a clear configuration error instead of a background thread failure.',
          'Reject /start with a structured missing_api_key response when no key is configured.',
          ['app.py', 'config.py'],
        ),
      );
    }
    if (!has('wsgi.py')) {
      findings.push(
        finding(
          'missing_wsgi_entrypoint',
          'medium',
          'Missing WSGI production entrypoint',
          'Public Flask deployments should not rely on app.py debug/server startup.',
          'Add wsgi.py exposing the Flask app for gunicorn.',
          ['wsgi.py'],
        ),
      );
    }
    if (!/\b(gunicorn|uwsgi|waitress)\b/i.test(productionDeps)) {
      findings.push(
        finding(
          'missing_python_production_server',
          'medium',
          'Missing Python production server dependency',
          'Public Flask demos should run behind a production WSGI server.',
          'Add gunicorn to requirements or pyproject dependencies.',
          has('requirements.txt') ? ['requirements.txt'] : ['pyproject.toml'],
        ),
      );
    }
    if (!has('Dockerfile')) {
      findings.push(
        finding(
          'missing_deployment_artifact',
          'medium',
          'Missing Dockerfile for public demo deployment',
          'A Dockerfile makes the demo reproducible on common hosting platforms.',
          'Add a Python Dockerfile with a /healthz health check.',
          ['Dockerfile'],
        ),
      );
    }
    if (!hasApiTests) {
      findings.push(
        finding(
          'missing_api_tests',
          'high',
          'Missing Flask API tests',
          'Syntax-only tests do not prove that the public routes work.',
          'Add tests/test_app.py covering /healthz, /modes, /config and /start error handling.',
          ['tests/test_app.py'],
        ),
      );
    }
    if (!readme || !/Docker|gunicorn|healthz/i.test(readme)) {
      findings.push(
        finding(
          'missing_deployment_docs',
          'medium',
          'README lacks public deployment instructions',
          'A public demo should document production startup, Docker and health checks.',
          'Document gunicorn/Docker startup and required environment variables.',
          ['README.md'],
        ),
      );
    }
    if (!hasFlaskSecurityHeaders(appPy)) {
      findings.push(
        finding(
          'missing_security_headers',
          'high',
          'Missing basic HTTP security headers',
          'Public Flask products should set defensive browser headers on every response.',
          'Add an after_request hook for X-Content-Type-Options, X-Frame-Options, Referrer-Policy and Cache-Control where appropriate.',
          ['app.py', 'tests/test_app.py'],
        ),
      );
    }
    if (hasStartRoute && !hasFlaskStartInputValidation(appPy)) {
      findings.push(
        finding(
          'missing_start_input_validation',
          'high',
          'Start route does not validate mode and speed input',
          'Invalid public API inputs should fail predictably instead of leaking into background game threads.',
          'Validate mode against GAME_MODES and clamp or reject speed outside an allowed range.',
          ['app.py', 'tests/test_app.py'],
        ),
      );
    }
    if (hasStartRoute && !hasActiveGameLimit(appPy, configText)) {
      findings.push(
        finding(
          'missing_active_game_limit',
          'high',
          'No active game concurrency limit detected',
          'A public demo without a concurrency limit can exhaust memory or provider quota.',
          'Add MAX_ACTIVE_GAMES configuration and reject /start when the in-memory game limit is reached.',
          ['app.py', 'config.py', 'tests/test_app.py'],
        ),
      );
    }
    if (!hasStructuredLogging(appPy)) {
      findings.push(
        finding(
          'missing_structured_logging',
          'medium',
          'App uses no structured logging for operational events',
          'Industrial operation needs request/start/error/cleanup logs instead of silent background failures.',
          'Configure a module logger and log game start, cleanup and background exceptions.',
          ['app.py'],
        ),
      );
    }
    if (testFiles.length > 0 && !hasIndustrialFlaskApiTests(testTexts.join('\n'), hasStartRoute)) {
      findings.push(
        finding(
          'missing_industrial_api_tests',
          'high',
          'Flask API tests do not cover industrial runtime controls',
          'Endpoint tests should prove security headers, invalid input handling and resource limits.',
          'Extend tests/test_app.py to cover security headers, invalid mode/speed and active game limit behavior.',
          ['tests/test_app.py'],
        ),
      );
    }
    if (testFiles.length > 0 && !hasRegressionTests(files, testTexts.join('\n'))) {
      findings.push(
        finding(
          'missing_regression_tests',
          'high',
          'Missing Flask regression tests',
          'Productization needs explicit regression coverage so fixed public API failures stay fixed across later iterations.',
          'Add tests/test_regression.py covering health/security headers and rejected invalid /start input.',
          ['tests/test_regression.py'],
        ),
      );
    }
    if (!hasOperationalDocs(files)) {
      findings.push(
        finding(
          'missing_operational_docs',
          'medium',
          'Missing operational documentation',
          'Industrial handoff needs architecture and operations notes beyond the README quickstart.',
          'Add docs/architecture.md and docs/operations.md covering runtime flow, configuration, verification and deployment.',
          ['docs/architecture.md', 'docs/operations.md'],
        ),
      );
    }
    const llmSurfaceText = `${appPy}\n${configText}\n${playerText}\n${gameText}\n${templateText}\n${requirementsText}\n${pyprojectText}`;
    if (isOpenAICompatibleLlmDemo(llmSurfaceText) && usesServerWideLlmKey(llmSurfaceText) && !hasPlayerSuppliedLlmProviderConfig(llmSurfaceText)) {
      findings.push(
        finding(
          'missing_user_llm_provider_config',
          'high',
          'LLM demo requires a server-wide API key instead of player-supplied provider configuration',
          'A public LLM game should let each player choose DeepSeek, MiniMax, Qwen, OpenAI-compatible or custom endpoints in the UI and submit their own key per session; sharing one deployment key is unsafe, costly and blocks players with different model providers.',
          'Add provider presets, a per-start api_key/model/base_url payload, server-side validation/redaction and UI controls for player-supplied LLM configuration.',
          ['app.py', 'player.py', 'game.py', 'templates/index.html', 'llm_config.py', 'tests/test_llm_config.py'],
        ),
      );
    }
    if (hasBrokenLlmProviderSelectContract(templateText, llmConfigText)) {
      findings.push(
        finding(
          'broken_llm_provider_select_options',
          'high',
          'LLM provider select renders empty option labels',
          'The browser UI expects a provider label field, but the public provider presets do not expose it. Users see blank provider choices even though /config returns providers.',
          'Align the /config provider schema with the UI by exposing label/default_model fields or by making the template fall back to name/id, and add tests for non-empty provider option labels.',
          ['llm_config.py', 'templates/index.html', 'tests/test_llm_config.py'],
        ),
      );
    }
    if (hasIncompleteLlmProviderCatalog(templateText, llmConfigText)) {
      findings.push(
        finding(
          'incomplete_llm_provider_catalog',
          'medium',
          'LLM provider catalog omits common player-selectable providers',
          'A public LLM UI should support more than one vendor path. Missing MiniMax, Qwen or custom OpenAI-compatible endpoints prevents players from using their available model/key.',
          'Expand public provider presets to include DeepSeek, MiniMax, Qwen, OpenAI-compatible and custom endpoint choices with labels and default models.',
          ['llm_config.py', 'templates/index.html', 'tests/test_llm_config.py'],
        ),
      );
    }
    if (hasLlmProviderCatalogMissingOfficialModels(templateText, llmConfigText)) {
      findings.push(
        finding(
          'llm_provider_catalog_missing_official_models',
          'medium',
          'LLM model catalog is not backed by official model choices',
          'Provider selection alone is not enough. A public LLM UI needs model choices sourced from provider documentation so players are not forced to type stale or unknown model ids into an empty field.',
          'Refresh the official model catalog with controlled web access, expose models/default_model/source_url in public provider presets and populate the model selector from those presets.',
          ['llm_config.py', 'templates/index.html', 'tests/test_llm_config.py'],
        ),
      );
    }
    const officialModelCatalog = await loadOfficialModelCatalog(snapshot.project_path);
    if (hasLlmProviderCatalogOutdatedAgainstOfficialRefresh(llmConfigText, officialModelCatalog)) {
      findings.push(
        finding(
          'llm_provider_catalog_outdated_against_official_refresh',
          'medium',
          'LLM provider catalog is stale against the refreshed official model catalog',
          'The project has a refreshed official model catalog, but its public provider presets still expose older defaults or model lists. Users may see stale model choices even after MatrixOmnix has researched current provider docs.',
          'Re-apply the refreshed official model catalog to llm_config.py and update tests so provider defaults are validated against public_provider_config().',
          ['llm_config.py', 'templates/index.html', 'tests/test_llm_config.py'],
        ),
      );
    }
  }
  const hasNonWebProductSurface = deliverySurfaceIds.some((surface) => [
    'game_demo',
    'three_d_scene',
    'mobile_app',
    'desktop_app',
    'browser_extension',
  ].includes(surface));
  if (isFrontendUiApp(snapshot, files, pkg) && !hasNonWebProductSurface) {
    productMaturity = await assessWebUiProductMaturity(snapshot.project_path, files, pkg);
    if (!hasUiProductVerification(files, scripts)) {
      findings.push(
        finding(
          'missing_ui_product_verification',
          'high',
          'UI app is missing browser-level product verification',
          'Pure UI demos can pass a build while still rendering a blank page, overflowing on mobile or hiding broken interactions.',
          'Add a UI product verification harness with browser smoke tests, responsive viewport checks and a deterministic CI script.',
          ['scripts/ui-product-check.mjs', 'playwright.config.ts', 'tests/ui/smoke.spec.ts', 'package.json'],
        ),
      );
    }
    if (hasUiProductVerification(files, scripts) && !hasUiRuntimeRenderSmoke(files, scripts)) {
      findings.push(
        finding(
          'missing_ui_runtime_render_smoke',
          'medium',
          'UI browser harness lacks runtime render smoke checks',
          'A browser harness should prove the page actually renders visible, nonblank UI across desktop and mobile, not only that a test file exists.',
          'Add a render smoke script or Playwright assertions that capture screenshots, reject blank bodies and detect horizontal overflow.',
          ['scripts/ui-render-smoke.mjs', 'tests/ui/smoke.spec.ts', 'playwright.config.ts', 'package.json'],
        ),
      );
    }
    if (productMaturity.level !== 'market_ready') {
      findings.push(
        finding(
          'below_web_ui_product_maturity',
          'medium',
          'Web UI product maturity is below a shippable product surface',
          'A UI product needs more than compiled components: it needs responsive behavior, accessibility semantics, interaction states, loading/error/empty states and browser-level verification.',
          `Close missing UI capabilities: ${productMaturity.missing_capabilities.slice(0, 6).join(', ')}.`,
          ['src', 'app', 'pages', 'tests/ui/smoke.spec.ts', 'scripts/ui-product-check.mjs'],
        ),
      );
    }
  }
  if (isUiBearingProject(snapshot, files, pkg)) {
    findings.push(...await assessUiImplementationRisks(snapshot.project_path, files, snapshot, pkg, projectSurfaceText));
  }
  if (isSocialDeductionGame(gameText, readme ?? '')) {
    const agentFacingSocialDeduction = isAgentFacingSocialDeductionGame([
      gameText,
      playerText,
      templateText,
      configText,
      readme ?? '',
    ].join('\n'));
    const testFiles = files.filter((f) => /(^|\/)tests?\/.*\.py$/.test(f));
    const testTexts = await Promise.all(testFiles.map((f) => readTextSafe(path.join(snapshot.project_path, f))));
    const allTests = testTexts.join('\n');
    const rulesText = (await readTextSafe(path.join(snapshot.project_path, 'rules.py'))) ?? '';
    if (!has('rules.py') || !/from\s+rules\s+import|import\s+rules/.test(gameText)) {
      findings.push(
        finding(
          'missing_social_deduction_rules_engine',
          'high',
          'Social deduction rules are still embedded in demo orchestration code',
          'A product game needs a deterministic, testable rules layer instead of burying core outcomes in UI/orchestration flow.',
          'Extract winner and vote-resolution behavior into rules.py and call it from game.py.',
          ['game.py', 'rules.py', 'tests/test_rules.py'],
        ),
      );
    }
    if (/random\.choice\s*\(\s*cands\s*\)/.test(gameText)) {
      findings.push(
        finding(
          'random_social_deduction_tie_breaker',
          'high',
          'Vote ties are resolved by random execution',
          'Competitive social deduction games should make tie policy explicit and fair; random execution makes outcomes feel arbitrary.',
          'Use a deterministic tie outcome such as no execution or a tested runoff policy.',
          ['game.py', 'rules.py', 'tests/test_rules.py'],
        ),
      );
    }
    if (!files.includes('tests/test_rules.py') && !/resolve_vote_result|winner_from_alive_roles|平票|tie vote|double_save/.test(allTests)) {
      findings.push(
        finding(
          'missing_social_deduction_rule_tests',
          'high',
          'Missing rule-level tests for the social deduction game',
          'Endpoint smoke tests do not prove core gameplay rules such as votes, win conditions and role distribution.',
          'Add tests/test_rules.py covering vote ties, clear executions, win conditions and role distributions.',
          ['rules.py', 'tests/test_rules.py'],
        ),
      );
    }
    if (has('rules.py') && /GAME_MODES/.test(gameText) && !hasSocialDeductionModeValidation(rulesText)) {
      findings.push(
        finding(
          'missing_social_deduction_mode_validation',
          'high',
          'Social deduction game modes are not validated by the rules engine',
          'A product game should reject broken role configurations before they create unfair or unplayable matches.',
          'Add validate_mode_config and validate_game_modes helpers that check role counts, wolf ratio and required teams.',
          ['rules.py', 'tests/test_rules.py', 'docs/game-design.md'],
        ),
      );
    }
    if (has('rules.py') && /GAME_MODES/.test(gameText) && !hasSocialDeductionModeValidationTests(allTests)) {
      findings.push(
        finding(
          'missing_social_deduction_mode_tests',
          'high',
          'Missing mode-validation tests for the social deduction game',
          'Rule-level vote tests do not prove that configured game modes are balanced enough to start.',
          'Extend tests/test_rules.py with passing and failing mode-configuration cases.',
          ['rules.py', 'tests/test_rules.py'],
        ),
      );
    }
    if (has('rules.py') && /GAME_MODES/.test(gameText) && hasSocialDeductionModeValidation(rulesText) && !hasSocialDeductionModeStartupGuard(gameText)) {
      findings.push(
        finding(
          'missing_social_deduction_mode_startup_guard',
          'high',
          'Game mode validation is not enforced during startup',
          'Mode validation only protects production gameplay if the game fails fast before an invalid role setup can start.',
          'Call validate_game_modes(GAME_MODES) from game.py and raise when configured modes are invalid.',
          ['game.py', 'rules.py', 'tests/test_rules.py'],
        ),
      );
    }
    if (!files.includes('docs/game-design.md')) {
      findings.push(
        finding(
          'missing_game_design_doc',
          'medium',
          'Missing game design documentation',
          'A game product needs a durable rules/design reference so future iterations do not regress core play.',
          'Add docs/game-design.md documenting role configuration, vote policy, win conditions and event timeline.',
          ['docs/game-design.md'],
        ),
      );
    }
    productMaturity = agentFacingSocialDeduction
      ? await assessAgentSocialDeductionTheaterMaturity(snapshot.project_path, files)
      : await assessSocialDeductionProductMaturity(snapshot.project_path, files);
    const productIntegration = agentFacingSocialDeduction
      ? null
      : await assessSocialDeductionRuntimeIntegration(snapshot.project_path, files);
    if (
      productIntegration &&
      productIntegration.has_backbone_modules &&
      (!productIntegration.has_runtime_integration ||
        !productIntegration.has_user_facing_workflows ||
        !productIntegration.has_end_to_end_verification)
    ) {
      findings.push(
        finding(
          'disconnected_social_product_backbone',
          'high',
          'Social product backbone modules are disconnected from the running app',
          'A product backbone only counts when players can reach it through the app and tests prove the end-to-end workflow. Isolated modules plus module-only tests inflate maturity without improving the shipped experience.',
          'Wire account, lobby, moderation, ranking, history and host-control systems into Flask routes/templates and add endpoint or browser workflow tests.',
          productIntegration.related_files,
        ),
      );
    }
    if (productMaturity.level !== 'market_ready') {
      findings.push(
        finding(
          agentFacingSocialDeduction ? 'below_agent_social_deduction_theater_maturity' : 'below_social_deduction_market_parity',
          'medium',
          agentFacingSocialDeduction
            ? 'Agent-facing social deduction theater maturity is below product grade'
            : 'Social deduction product maturity is below mature market parity',
          agentFacingSocialDeduction
            ? 'An agent-facing werewolf product should be judged by model configuration, deterministic rules, replay/evaluation, observability and observer workflows rather than human matchmaking alone.'
            : 'Engineering readiness is not the same as a mature social game product: market examples include accounts, lobbies, matchmaking, social communication, moderation, rankings, live operations and large role/content systems.',
          `Close missing market capabilities: ${productMaturity.missing_capabilities.slice(0, 6).join(', ')}.`,
          agentFacingSocialDeduction
            ? ['docs/agent-product.md', 'app.py', 'game.py', 'player.py', 'rules.py', 'tests/test_app.py', 'tests/test_eval_harness.py']
            : ['docs/market-parity.md', 'app.py', 'game.py', 'rules.py', 'tests/test_app.py'],
        ),
      );
    }
  }

  const marketResearchReport = await loadMarketResearchReport(snapshot.project_path);
  if (marketResearchReport) {
    const marketGaps = await analyzeMarketResearchGaps(snapshot.project_path, files, marketResearchReport);
    findings.push(...marketGaps.findings);
    productMaturity = mergeProductMaturity(productMaturity, marketGaps.product_maturity);
  }
  addVerificationFailureFindings(findings, snapshot, score);

  const agentMisjudgments = auditAgentMisjudgments({
    findings,
    snapshot,
    files,
    pkg,
    scripts,
    projectSurfaceText: `${projectSurfaceText}\n${appPy}\n${gameText}\n${configText}\n${playerText}\n${templateText}\n${requirementsText}\n${pyprojectText}\n${readme ?? ''}`,
    readme: readme ?? '',
  });
  const suppressedFindingIds = new Set(
    agentMisjudgments
      .filter((audit) => audit.action === 'suppress_finding')
      .map((audit) => audit.finding_id),
  );
  const activeFindings = findings.filter((f) => !suppressedFindingIds.has(f.id));
  const sortedFindings = activeFindings.sort((a, b) => sevRank(a.severity) - sevRank(b.severity));
  const finalScore = applyGapScoreGate(score, sortedFindings, productMaturity);

  // 8. Score-driven recommendations
  const recommendations: string[] = [];
  if (finalScore.breakdown.test_score < 10) recommendations.push('Invest in test coverage first — it unlocks safe iteration.');
  if (finalScore.breakdown.docs_score < 6) recommendations.push('Expand README and add a docs/ folder explaining architecture.');
  if (finalScore.breakdown.agent_process_score < 6) recommendations.push('Adopt a QA / iteration discipline (this tool can help).');
  if (finalScore.breakdown.build_score < 6) recommendations.push('Add an explicit build/typecheck step.');
  if (agentMisjudgments.length > 0) {
    recommendations.push(`Analyzer suppressed ${agentMisjudgments.length} likely agent misjudgment(s) before planning.`);
  }

  const blockers = sortedFindings.filter((f) => f.severity === 'blocker');

  return {
    project_snapshot: snapshot,
    score: finalScore,
    findings: sortedFindings,
    blockers,
    recommendations,
    product_maturity: productMaturity,
    agent_misjudgments: agentMisjudgments.length > 0 ? agentMisjudgments : undefined,
  };
}

function addVerificationFailureFindings(
  findings: GapFinding[],
  snapshot: ProjectSnapshot,
  score: ProjectScore,
): void {
  const failures = score.score_gate?.failures ?? [];
  for (const failure of failures) {
    if (failure.gate !== 'test' && failure.gate !== 'build') continue;
    const command = failure.evidence_command ? `: ${failure.evidence_command}` : '';
    const isTest = failure.gate === 'test';
    const output = truncateVerificationOutput([
      failure.stdout_summary,
      failure.stderr_summary,
    ].filter(Boolean).join('\n'));
    const outputPaths = extractRelativePaths(output);
    const flaskRelated =
      snapshot.detected_language === 'python' && snapshot.detected_frameworks.includes('flask')
        ? ['app.py', 'config.py', 'tests/test_app.py']
        : [];
    const related = outputPaths.length > 0
      ? outputPaths
      : (flaskRelated.length > 0 ? flaskRelated : (isTest ? ['tests'] : snapshot.important_files.slice(0, 5)));
    findings.push(
      finding(
        isTest ? 'failed_test_verification' : 'failed_build_verification',
        'blocker',
        `${isTest ? 'Test' : 'Build'} verification failed${command}`,
        'A project with red verification cannot be treated as product-ready, regardless of its file structure.',
        [
          `Reproduce the failing ${isTest ? 'test' : 'build'} command, fix the root cause, and rerun verification.`,
          failure.failure_reason ? `Failure reason: ${failure.failure_reason}` : '',
          output ? `Recent verification output:\n${output}` : '',
        ].filter(Boolean).join('\n\n'),
        related,
      ),
    );
  }
}

function truncateVerificationOutput(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  return trimmed.length > 2500 ? `${trimmed.slice(0, 2500)}\n... [truncated]` : trimmed;
}

function extractRelativePaths(text: string): string[] {
  const out = new Set<string>();
  const re = /(?:^|[\s("'`>])([A-Za-z0-9_./-]+\.(?:py|js|mjs|ts|tsx|jsx|json|toml|md|yml|yaml|txt|html|css|sh))(?::\d+)?/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const rel = match[1]?.replace(/^\.\//, '');
    if (!rel || rel.startsWith('/') || rel.includes('..')) continue;
    if (/^(site-packages|node_modules)\//.test(rel)) continue;
    out.add(rel);
  }
  return Array.from(out).slice(0, 12);
}

function applyGapScoreGate(
  score: ProjectScore,
  findings: GapFinding[],
  productMaturity?: ProductMaturityAssessment,
): ProjectScore {
  const highSeverityOpenGaps = findings.filter((f) => f.severity === 'blocker' || f.severity === 'high').length;
  const gateFailures: NonNullable<ProjectScore['score_gate']>['failures'] = [];

  if (highSeverityOpenGaps > 0) {
    gateFailures.push(...evaluateScoreGate({
      evidence: score.score_evidence ?? [],
      highSeverityOpenGaps,
    }).failures);
  }

  const maturityFailure = productMaturityScoreGateFailure(productMaturity);
  if (maturityFailure) gateFailures.push(maturityFailure);

  if (gateFailures.length === 0) return score;

  const mergedFailures = mergeGateFailures(score.score_gate?.failures ?? [], gateFailures);
  const cap = mergedFailures.length > 0 ? Math.min(...mergedFailures.map((f) => f.cap)) : 100;
  const total = Math.min(score.total, cap);
  const gate = {
    status: mergedFailures.length > 0 ? 'failed' as const : 'passed' as const,
    cap,
    failures: mergedFailures,
  };
  const gateNote = `score gate failed: ${gateFailures.map((f) => `${f.reason} (cap ${f.cap})`).join('; ')}`;
  const notes = score.notes.some((n) => n === gateNote) ? score.notes : [...score.notes, gateNote];

  const updatedScore: ProjectScore = {
    ...score,
    total,
    grade: gradeProjectScore(total),
    notes,
    score_gate: gate,
  };
  const confidenceAdjusted = (score as ProjectScore & { confidence_adjusted_score?: number }).confidence_adjusted_score;
  if (typeof confidenceAdjusted === 'number') {
    (updatedScore as ProjectScore & { confidence_adjusted_score?: number }).confidence_adjusted_score = Math.min(confidenceAdjusted, total);
  }
  return updatedScore;
}

function productMaturityScoreGateFailure(
  productMaturity?: ProductMaturityAssessment,
): NonNullable<ProjectScore['score_gate']>['failures'][number] | null {
  if (!productMaturity || productMaturity.level === 'market_ready') return null;
  return {
    gate: 'product_maturity',
    cap: Math.min(89, productMaturity.score),
    reason: `${productMaturity.domain} maturity ${productMaturity.score}/100 below market_ready`,
  };
}

function mergeProductMaturity(
  existing: ProductMaturityAssessment | undefined,
  next: ProductMaturityAssessment,
): ProductMaturityAssessment {
  if (!existing) return next;
  const base = next.score <= existing.score ? next : existing;
  const other = base === next ? existing : next;
  return {
    ...base,
    summary: `${base.summary} Additional assessment: ${other.summary}`,
    capabilities: dedupeCapabilities([...base.capabilities, ...other.capabilities]),
    missing_capabilities: Array.from(new Set([...base.missing_capabilities, ...other.missing_capabilities])),
    references: Array.from(new Set([...base.references, ...other.references])),
  };
}

function dedupeCapabilities(capabilities: ProductMaturityAssessment['capabilities']): ProductMaturityAssessment['capabilities'] {
  const seen = new Set<string>();
  const out: ProductMaturityAssessment['capabilities'] = [];
  for (const cap of capabilities) {
    if (seen.has(cap.id)) continue;
    seen.add(cap.id);
    out.push(cap);
  }
  return out;
}

function mergeGateFailures(
  existing: NonNullable<ProjectScore['score_gate']>['failures'],
  next: NonNullable<ProjectScore['score_gate']>['failures'],
): NonNullable<ProjectScore['score_gate']>['failures'] {
  const seen = new Set<string>();
  const merged: NonNullable<ProjectScore['score_gate']>['failures'] = [];
  for (const failure of [...existing, ...next]) {
    const key = `${failure.gate}:${failure.reason}:${failure.evidence_command ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(failure);
  }
  return merged;
}

export type PackageLike = {
  bin?: unknown;
  main?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
} | null | undefined;

export interface MisjudgmentAuditInput {
  findings: GapFinding[];
  snapshot: ProjectSnapshot;
  files: string[];
  pkg: PackageLike;
  scripts: Record<string, string>;
  projectSurfaceText: string;
  readme: string;
}

export function auditAgentMisjudgments(input: MisjudgmentAuditInput): AgentMisjudgmentAudit[] {
  const audits: AgentMisjudgmentAudit[] = [];
  const add = (finding: GapFinding, reason: string, relatedFiles = finding.related_files) => {
    audits.push({
      finding_id: finding.id,
      finding_category: finding.category,
      action: 'suppress_finding',
      confidence: 'high',
      reason,
      related_files: relatedFiles,
    });
  };

  for (const f of input.findings) {
    if (f.category === 'missing_cli_contract_harness' && !hasCliProjectEvidence(input.files, input.pkg)) {
      add(f, 'CLI harness finding lacked a package bin, bin/ entry, cli.py or CLI framework dependency.');
    }
    if (f.category === 'single_file_demo_without_intake_harness' && !detectSingleFileDemoEntry(input.files)) {
      add(f, 'Single-file intake finding lacked exactly one root demo entry without structured app directories.');
    }
    if (
      (f.category === 'missing_ui_product_verification' ||
        f.category === 'below_web_ui_product_maturity' ||
        f.category === 'ui_unimplemented_hosted_service_claim' ||
        f.category.startsWith('ui_')) &&
      !isUiBearingProject(input.snapshot, input.files, input.pkg)
    ) {
      add(f, 'UI finding lacked frontend dependencies, UI entrypoints or template/static UI files.');
    }
    if (f.category === 'missing_user_llm_provider_config' && !isOpenAICompatibleLlmDemo(input.projectSurfaceText)) {
      add(f, 'LLM provider-config finding lacked OpenAI-compatible client, key or model-provider evidence.');
    }
    if (
      (f.category.startsWith('missing_social_deduction') ||
        f.category === 'random_social_deduction_tie_breaker' ||
        f.category === 'missing_game_design_doc' ||
        f.category === 'below_social_deduction_market_parity' ||
        f.category === 'below_agent_social_deduction_theater_maturity') &&
      !isSocialDeductionGame(input.projectSurfaceText, input.readme)
    ) {
      add(f, 'Social-deduction finding lacked werewolf/social-deduction gameplay evidence.');
    }
    if (f.category === 'misaligned_node_scaffold' && !hasDisallowedNodeScaffold(input.snapshot, input.scripts)) {
      add(f, 'Node-scaffold finding only saw allowed cross-runtime harness scripts.');
    }
    if (f.category === 'missing_api_contract_harness' && !isApiBearingProject(input.snapshot, input.files, input.pkg, input.projectSurfaceText)) {
      add(f, 'API harness finding lacked API framework, route declaration or api/ source evidence.');
    }
    if (f.category === 'missing_config_contract_harness' && detectEnvVars(input.projectSurfaceText).length === 0) {
      add(f, 'Config harness finding lacked environment-variable usage in source/config files.');
    }
    if (f.category === 'missing_data_migration_harness' && !isDataBearingProject(input.files, input.pkg, input.projectSurfaceText)) {
      add(f, 'Data harness finding lacked ORM, schema, model or migration evidence.');
    }
    if (f.category === 'missing_worker_contract_harness' && !isWorkerBearingProject(input.files, input.pkg, input.projectSurfaceText)) {
      add(f, 'Worker harness finding lacked queue, scheduler, worker or jobs/task evidence.');
    }
  }
  return audits;
}

function hasCliProjectEvidence(files: string[], pkg: PackageLike): boolean {
  return isCliProject(files, pkg);
}

function hasDisallowedNodeScaffold(snapshot: ProjectSnapshot, scripts: Record<string, string>): boolean {
  return snapshot.detected_language === 'python' &&
    Object.entries(scripts)
      .filter(([key, script]) => !isAllowedCrossRuntimeHarnessScript(key, script))
      .some(([, s]) => /\bnode\b|npm\b|tsc\b/.test(s));
}

async function readProjectSurfaceText(root: string, files: string[]): Promise<string> {
  const candidates = files
    .filter((f) =>
      /(^|\/)(app|main|server|api|routes|worker|jobs|tasks|config|settings|database|db|models|schema)\.(py|js|mjs|cjs|ts|tsx)$/.test(f) ||
      /^(src|app|server|api|routes|config|db|database|models|workers|jobs|tasks)\//.test(f) ||
      /(^|\/)(manifest\.json|app\.json|app\.config\.(js|ts)|tauri\.conf\.json)$/.test(f),
    )
    .filter((f) => /\.(py|js|mjs|cjs|ts|tsx|json|toml|env|yml|yaml|html|ipynb)$/.test(f))
    .slice(0, 80);
  const texts = await Promise.all(candidates.map((f) => readTextSafe(path.join(root, f))));
  return texts.filter((t): t is string => !!t).join('\n');
}

function detectEnvVars(text: string): string[] {
  const names = new Set<string>();
  const patterns = [
    /process\.env\.([A-Z][A-Z0-9_]{1,80})/g,
    /process\.env\[['"]([A-Z][A-Z0-9_]{1,80})['"]\]/g,
    /os\.environ(?:\.get)?\(\s*['"]([A-Z][A-Z0-9_]{1,80})['"]/g,
    /getenv\(\s*['"]([A-Z][A-Z0-9_]{1,80})['"]/g,
    /\benv(?:\.str|\.int|\.bool)?\(\s*['"]([A-Z][A-Z0-9_]{1,80})['"]/g,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      if (match[1]) names.add(match[1]);
    }
  }
  return Array.from(names).sort();
}

function isApiBearingProject(
  snapshot: ProjectSnapshot,
  files: string[],
  pkg: PackageLike,
  sourceText: string,
): boolean {
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  const apiDeps = ['express', 'fastify', 'koa', 'hono', '@nestjs/core', 'flask', 'fastapi', 'django', 'starlette'];
  return snapshot.detected_frameworks.some((f) => ['express', 'fastify', 'nestjs', 'flask', 'fastapi', 'django', 'starlette'].includes(f)) ||
    apiDeps.some((dep) => dep in deps) ||
    files.some((f) => /^api\/.+\.(ts|tsx|js|mjs|cjs|py)$/.test(f)) ||
    /@app\.(?:route|get|post|put|delete|patch)\(|FastAPI\s*\(|APIRouter\s*\(|express\s*\(|fastify\s*\(|new\s+Hono\s*\(|router\.(?:get|post|put|delete|patch)\(/.test(sourceText);
}

function hasApiContractHarness(files: string[], scripts: Record<string, string>): boolean {
  const scriptBlob = Object.entries(scripts).map(([k, v]) => `${k}:${v}`).join('\n');
  return files.includes('scripts/api-contract-check.mjs') &&
    files.includes('docs/api-contract.md') &&
    /\bapi:contract-check\b|\bapi-contract-check\.mjs\b/.test(scriptBlob);
}

function hasConfigContractHarness(files: string[], scripts: Record<string, string>): boolean {
  const scriptBlob = Object.entries(scripts).map(([k, v]) => `${k}:${v}`).join('\n');
  return files.includes('scripts/config-contract-check.mjs') &&
    files.includes('docs/config-contract.md') &&
    /\bconfig:contract-check\b|\bconfig-contract-check\.mjs\b/.test(scriptBlob);
}

function isDataBearingProject(files: string[], pkg: PackageLike, sourceText: string): boolean {
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  return ['prisma', '@prisma/client', 'drizzle-orm', 'typeorm', 'sequelize', 'mongoose', 'knex', 'sqlalchemy', 'alembic'].some((dep) => dep in deps) ||
    files.some((f) => /^(migrations|prisma|db|database)\//.test(f) || /(^|\/)(schema\.prisma|models\.py|database\.py|db\.py)$/.test(f)) ||
    /\b(create_engine|declarative_base|mongoose\.connect|new\s+PrismaClient|drizzle\(|knex\(|sequelize\.define)\b/.test(sourceText);
}

function hasDataContractHarness(files: string[], scripts: Record<string, string>): boolean {
  const scriptBlob = Object.entries(scripts).map(([k, v]) => `${k}:${v}`).join('\n');
  return files.includes('scripts/data-contract-check.mjs') &&
    files.includes('docs/data-contract.md') &&
    /\bdata:contract-check\b|\bdata-contract-check\.mjs\b/.test(scriptBlob);
}

function isWorkerBearingProject(files: string[], pkg: PackageLike, sourceText: string): boolean {
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  return ['bullmq', 'bull', 'bee-queue', 'agenda', 'node-cron', 'celery', 'rq', 'dramatiq', 'apscheduler'].some((dep) => dep in deps) ||
    files.some((f) => /^(workers?|jobs?|tasks?)\//.test(f) || /(^|\/)(worker|jobs|tasks|scheduler)\.(py|js|mjs|cjs|ts)$/.test(f)) ||
    /\b(new\s+Worker|Queue\(|worker_process|@shared_task|Celery\(|BackgroundTasks|cron\.schedule|APScheduler)\b/.test(sourceText);
}

function hasWorkerContractHarness(files: string[], scripts: Record<string, string>): boolean {
  const scriptBlob = Object.entries(scripts).map(([k, v]) => `${k}:${v}`).join('\n');
  return files.includes('scripts/worker-contract-check.mjs') &&
    files.includes('docs/worker-contract.md') &&
    /\bworker:contract-check\b|\bworker-contract-check\.mjs\b/.test(scriptBlob);
}

function hasDemoSurfaceContractMatrix(files: string[], scripts: Record<string, string>): boolean {
  const scriptBlob = Object.entries(scripts).map(([k, v]) => `${k}:${v}`).join('\n');
  return files.includes('scripts/surface-contract-check.mjs') &&
    files.includes('docs/productization-surface-map.md') &&
    /\bsurface:contract-check\b|\bsurface-contract-check\.mjs\b/.test(scriptBlob);
}

function hasSpecializedSurfaceHarness(files: string[], scripts: Record<string, string>, filePrefix: string, scriptPrefix: string): boolean {
  const scriptBlob = Object.entries(scripts).map(([k, v]) => `${k}:${v}`).join('\n');
  return files.includes(`scripts/${filePrefix}-contract-check.mjs`) &&
    files.includes(`docs/${filePrefix}-contract.md`) &&
    new RegExp(`\\b${scriptPrefix}:contract-check\\b|\\b${filePrefix}-contract-check\\.mjs\\b`).test(scriptBlob);
}

function needsRunnableProductEntry(surfaceIds: string[]): boolean {
  return surfaceIds.some((surface) => [
    'game_demo',
    'three_d_scene',
    'mobile_app',
    'desktop_app',
    'ml_model',
    'media_pipeline',
  ].includes(surface));
}

function needsSpecializedSurfaceDepth(surfaceIds: string[]): boolean {
  return surfaceIds.some((surface) => [
    'browser_extension',
    'notebook',
    'mobile_app',
    'desktop_app',
    'game_demo',
    'three_d_scene',
    'ml_model',
    'media_pipeline',
  ].includes(surface));
}

async function hasSpecializedSurfaceDomainDepth(root: string, surfaceIds: string[], files: string[]): Promise<boolean> {
  const sourceFiles = files.filter((file) =>
    !/(^|\/)(docs?|scripts?|tests?|\.github|node_modules|dist|build|coverage)\//.test(file) &&
    !/(^|\/)product[-_]core\.(mjs|js|ts|py)$/.test(file) &&
    (
      /^(index\.html|popup\.html|manifest\.json|app\.json|analysis\.ipynb|App\.(js|jsx|ts|tsx)|electron\.(js|mjs|cjs|ts))$/.test(file) ||
      /^(src|app|pages|components|static|assets|bin)\//.test(file)
    ) &&
    /\.(html|json|ipynb|mjs|js|ts|tsx|jsx|py|vue|svelte|css)$/.test(file)
  );
  const testFiles = files.filter((file) => /(^|\/)tests?\/.*\.(mjs|js|ts|tsx|jsx|py)$/.test(file));
  const sourceText = (await Promise.all(sourceFiles.slice(0, 120).map((file) => readTextSafe(path.join(root, file)))))
    .filter((text): text is string => Boolean(text))
    .join('\n')
    .toLowerCase();
  const testText = (await Promise.all(testFiles.slice(0, 80).map((file) => readTextSafe(path.join(root, file)))))
    .filter((text): text is string => Boolean(text))
    .join('\n')
    .toLowerCase();
  const hasTestsBeyondProductCore = testFiles.some((file) => !/product[-_]core/.test(file)) ||
    /\b(click|keyboard|pointer|render|canvas|fixture|sample|snapshot|navigation|ipc|message|predict|resize|workflow)\b/.test(testText);
  const signalCount = (patterns: RegExp[]): number => countSignals(sourceText, patterns);
  const hasEnoughSource = sourceText.replace(/\s+/g, '').length >= 500;

  if (surfaceIds.includes('game_demo')) {
    return hasEnoughSource &&
      signalCount([/\b(preload|update|physics|collision|collider|overlap)\b/, /\b(input|keyboard|pointer|controls?)\b/, /\b(player|enemy|npc|sprite|animation)\b/, /\b(score|level|health|lives|timer|state)\b/, /\b(scene\.start|tilemap|spawn|win|lose)\b/]) >= 3 &&
      hasTestsBeyondProductCore;
  }
  if (surfaceIds.includes('three_d_scene')) {
    return hasEnoughSource &&
      signalCount([/\b(light|ambientlight|directionallight|pointlight)\b/, /\b(mesh|geometry|material|texture)\b/, /\b(orbitcontrols|pointerlockcontrols|raycaster|controls)\b/, /\b(gltfloader|objloader|model|asset|loader)\b/, /\b(resize|pixelratio|animationmixer|camera\.position)\b/]) >= 3 &&
      hasTestsBeyondProductCore;
  }
  if (surfaceIds.includes('mobile_app')) {
    return hasEnoughSource &&
      signalCount([/\b(navigation|router|screen|stack)\b/, /\b(pressable|touchable|onpress|textinput|button)\b/, /\b(usestate|usereducer|zustand|redux|context)\b/, /\b(flatlist|sectionlist|scrollview|refreshcontrol)\b/, /\b(accessibilitylabel|accessibilityrole|asyncstorage|securestore)\b/]) >= 3 &&
      hasTestsBeyondProductCore;
  }
  if (surfaceIds.includes('desktop_app')) {
    return hasEnoughSource &&
      /\bbrowserwindow\b/.test(sourceText) &&
      /\b(contextisolation|sandbox|preload|contextbridge)\b/.test(sourceText) &&
      signalCount([/\b(ipcmain|ipcrenderer|invoke|handle)\b/, /\b(menu|tray|dialog|shortcut|protocol)\b/, /\b(loadfile|loadurl|renderer|preload)\b/]) >= 2 &&
      hasTestsBeyondProductCore;
  }
  if (surfaceIds.includes('browser_extension')) {
    return hasEnoughSource &&
      signalCount([/\b(chrome\.runtime|browser\.runtime|chrome\.tabs|browser\.tabs)\b/, /\b(content_scripts|background|service_worker|permissions)\b/, /\b(message|sendmessage|onmessage|storage\.local)\b/, /\b(popup|options|side_panel|action)\b/]) >= 3 &&
      hasTestsBeyondProductCore;
  }
  if (surfaceIds.includes('notebook')) {
    const notebookText = sourceText;
    const codeCellCount = (notebookText.match(/"cell_type"\s*:\s*"code"/g) ?? []).length;
    return codeCellCount >= 2 &&
      /\b(read_csv|dataframe|pandas|pd\.|numpy|np\.|sklearn|fit\(|predict\(|groupby|plot|assert|to_csv|sql|requests|http|fixture|sample|golden)\b/.test(notebookText) &&
      hasTestsBeyondProductCore;
  }
  if (surfaceIds.includes('ml_model')) {
    const modelFiles = files.filter((file) => /\.(onnx|pt|pth|safetensors|tflite|pkl|joblib)$/.test(file));
    const nonPlaceholderModel = modelFiles.some((file) => !/placeholder|demo/i.test(file));
    return nonPlaceholderModel &&
      signalCount([/\b(inference|predict|classify|embedding|tokenizer|preprocess|postprocess)\b/, /\b(sample|fixture|input|output|golden|threshold)\b/, /\b(onnxruntime|transformers|tensorflow|torch|ort\.inferencesession)\b/]) >= 2 &&
      hasTestsBeyondProductCore;
  }
  if (surfaceIds.includes('media_pipeline')) {
    return hasEnoughSource &&
      signalCount([/\b(sharp|ffmpeg|canvas|imagemagick|jimp|exif|metadata)\b/, /\b(resize|transcode|thumbnail|compress|watermark|crop|duration)\b/, /\b(input|output|fixture|sample|golden|batch|queue)\b/, /\b(stream|buffer|mime|format|codec)\b/]) >= 3 &&
      hasTestsBeyondProductCore;
  }
  return true;
}

function hasRunnableProductEntry(surfaceIds: string[], files: string[], scripts: Record<string, string>): boolean {
  const start = `${scripts.start ?? ''}\n${scripts.dev ?? ''}`;
  if (surfaceIds.includes('game_demo') || surfaceIds.includes('three_d_scene')) {
    return files.includes('index.html') && /\b(vite|webpack|parcel|serve|http-server)\b/i.test(start);
  }
  if (surfaceIds.includes('mobile_app')) {
    return files.some((file) => /^(App|app\/index)\.(js|jsx|ts|tsx)$/.test(file)) &&
      /\b(expo|react-native|capacitor|cordova)\b/i.test(start);
  }
  if (surfaceIds.includes('desktop_app')) {
    return /\b(electron|tauri)\b/i.test(start) &&
      files.some((file) => /^src-tauri\/|(^|\/)electron\.(js|mjs|cjs|ts)$/.test(file));
  }
  if (surfaceIds.includes('ml_model') || surfaceIds.includes('media_pipeline')) {
    return files.some((file) => /^bin\/product\.(js|mjs|cjs)$/.test(file)) &&
      /\b(bin\/product\.(js|mjs|cjs)|product:run)\b/.test(start);
  }
  return true;
}

function needsProductCoreSpine(surfaceIds: string[]): boolean {
  return surfaceIds.some((surface) => [
    'spa_ui',
    'api',
    'cli',
    'browser_extension',
    'notebook',
    'mobile_app',
    'desktop_app',
    'game_demo',
    'three_d_scene',
    'ml_model',
    'media_pipeline',
    'llm_app',
  ].includes(surface));
}

function hasAnyProductizationHarness(files: string[], scripts: Record<string, string>): boolean {
  const scriptBlob = Object.entries(scripts).map(([key, value]) => `${key}:${value}`).join('\n');
  return files.some((file) =>
    /^scripts\/.*(?:contract-check|product-check|render-smoke)\.mjs$/.test(file) ||
    /^docs\/.*(?:contract|productization|surface-map)\.md$/.test(file),
  ) || /\b(?:contract-check|ui:check|product-check)\b/.test(scriptBlob);
}

function hasProductCoreSpine(files: string[], scripts: Record<string, string>): boolean {
  const scriptBlob = Object.entries(scripts).map(([key, value]) => `${key}:${value}`).join('\n');
  const hasCoreSource = files.some((file) =>
    /^(src|app|lib|domain|core|services)\/(?:product[-_]core|product\/|domain\/|features\/|workflows\/).*\.(mjs|js|ts|py)$/.test(file) ||
    /^src\/product-core\.mjs$/.test(file),
  );
  const hasCoreTest = files.some((file) =>
    /^(tests?|src)\/.*product[-_]core.*\.(test|spec)?\.(mjs|js|ts|py)$/.test(file) ||
    /^tests\/product-core\.test\.mjs$/.test(file) ||
    /^tests\/test_product_core\.py$/.test(file),
  );
  const hasCoreDoc = files.includes('docs/product-core.md') || files.some((file) => /^docs\/.*product.*core.*\.md$/.test(file));
  const hasCoreCommand = /\bproduct:core-check\b|product-core\.test|product-core\.mjs/.test(scriptBlob);
  return hasCoreSource && hasCoreTest && hasCoreDoc && hasCoreCommand;
}

function hasFlaskStartConfigGuard(appPy: string): boolean {
  const match = /@app\.(?:route|post)\(\s*["']\/start["'][\s\S]*/.exec(appPy);
  if (!match) return false;
  const startRouteSection = match[0].split(/\n@app\.(?:route|get|post|put|delete|patch)\(/)[0] ?? match[0];
  const canonicalGuard = /if\s+not\s+has_api_key\s*\(\s*\)\s*:/.test(startRouteSection) &&
    /return\s+jsonify\s*\(\s*missing_api_key_payload\s*\(\s*\)\s*\)\s*,\s*400/.test(startRouteSection);
  const requireApiKey = /([A-Za-z_][A-Za-z0-9_]*)\s*,\s*[A-Za-z_][A-Za-z0-9_]*\s*=\s*require_api_key\s*\(\s*\)/.exec(startRouteSection);
  const requireGuard = !!requireApiKey &&
    new RegExp(`if\\s+not\\s+${requireApiKey[1]}\\s*:`).test(startRouteSection) &&
    /return\s+jsonify\s*\([\s\S]{0,200}\)\s*,\s*400/.test(startRouteSection);
  const playerSuppliedProviderGuard = /resolve_llm_config\s*\(\s*body\s*\)/.test(startRouteSection) &&
    /if\s+not\s+llm_config\s*\[\s*["']ok["']\s*\]\s*:/.test(startRouteSection) &&
    /return\s+jsonify\s*\([\s\S]{0,300}\)\s*,\s*400/.test(startRouteSection);
  return canonicalGuard || requireGuard || playerSuppliedProviderGuard;
}

function hasFlaskSecurityHeaders(appPy: string): boolean {
  return /after_request/.test(appPy) &&
    /X-Content-Type-Options/.test(appPy) &&
    /X-Frame-Options/.test(appPy) &&
    /Referrer-Policy/.test(appPy);
}

function hasFlaskStartInputValidation(appPy: string): boolean {
  const section = flaskStartRouteSection(appPy);
  return /mode\s+not\s+in\s+GAME_MODES|GAME_MODES\.get\s*\(\s*mode/.test(section) &&
    /invalid_mode|Invalid mode|unsupported mode/i.test(section) &&
    /(min\s*\(|max\s*\(|speed\s*[<>]=?\s*)/.test(section);
}

function hasActiveGameLimit(appPy: string, configText: string): boolean {
  return /MAX_ACTIVE_GAMES|max_active_games/.test(`${appPy}\n${configText}`) &&
    /too_many|active game|active_games|len\s*\(\s*_games\s*\)/i.test(appPy);
}

function hasStructuredLogging(appPy: string): boolean {
  return /import\s+logging/.test(appPy) &&
    /logging\.getLogger\s*\(/.test(appPy) &&
    /logger\.(?:info|warning|exception|error)\s*\(/.test(appPy);
}

function hasIndustrialFlaskApiTests(testText: string, hasStartRoute: boolean): boolean {
  if (!/X-Content-Type-Options/.test(testText)) return false;
  if (hasStartRoute) {
    return /invalid_mode|invalid mode|unsupported mode/i.test(testText) &&
      /too_many|active game|MAX_ACTIVE_GAMES|max_active_games/i.test(testText);
  }
  return /invalid_text|missing_text|invalid_message|missing_message|bad request|400/.test(testText) &&
    /\/summarize|\/chat|\/healthz|test_client\(/.test(testText);
}

function hasRegressionTests(files: string[], testText: string): boolean {
  return files.some((f) => /(^|\/)tests?\/.*regression.*\.py$/.test(f)) ||
    /pytest\.mark\.regression|@pytest\.mark\.regression/.test(testText);
}

function hasOperationalDocs(files: string[]): boolean {
  return files.includes('docs/architecture.md') && files.includes('docs/operations.md');
}

function isOpenAICompatibleLlmDemo(text: string): boolean {
  return /from\s+openai\s+import\s+OpenAI|OpenAI\s*\(|chat\.completions\.create|DEEPSEEK_API_KEY|OPENAI_API_KEY|WW_MODEL|WW_BASE_URL/i.test(text);
}

function usesServerWideLlmKey(text: string): boolean {
  return /os\.environ\.get\(\s*["'](?:DEEPSEEK_API_KEY|OPENAI_API_KEY|WW_MODEL|WW_BASE_URL)["']/.test(text) ||
    /require_api_key\s*\(\s*\)/.test(text);
}

function hasPlayerSuppliedLlmProviderConfig(text: string): boolean {
  return /resolve_llm_config\s*\(|public_provider_config\s*\(|llmApiKey|api_key["']?\s*:\s*|body\.get\(\s*["']api_key["']\s*\)/.test(text) &&
    /provider|base_url|model/i.test(text) &&
    /minimax|qwen|deepseek|custom/i.test(text);
}

function hasBrokenLlmProviderSelectContract(templateText: string, llmConfigText: string): boolean {
  if (!/id=["']llmProvider["']/.test(templateText)) return false;
  if (!/\bproviders\b/.test(llmConfigText)) return false;
  const templateRequiresLabel = /\bp\.label\b|provider\?\.label|\[['"]label['"]\]/.test(templateText);
  if (!templateRequiresLabel) return false;
  const templateHasFallback = /\bp\.label\s*(?:\|\||\?\?)\s*(?:p\.name|p\.id)|provider\?\.label\s*(?:\|\||\?\?)/.test(templateText);
  if (templateHasFallback) return false;
  const providersExposeLabel = /["']label["']\s*:|default_model/.test(llmConfigText);
  const providersExposeNameOnly = /["']name["']\s*:/.test(llmConfigText);
  return providersExposeNameOnly && !providersExposeLabel;
}

function hasIncompleteLlmProviderCatalog(templateText: string, llmConfigText: string): boolean {
  if (!/id=["']llmProvider["']/.test(templateText)) return false;
  if (!/public_provider_config\s*\(|\bproviders\b/.test(llmConfigText)) return false;
  const text = llmConfigText.toLowerCase();
  return ['deepseek', 'minimax', 'qwen', 'openai', 'custom'].some((provider) => !text.includes(provider));
}

function hasLlmProviderCatalogMissingOfficialModels(templateText: string, llmConfigText: string): boolean {
  if (!/id=["']llmProvider["']/.test(templateText)) return false;
  if (!/id=["']llmModel["']|llmModel/.test(templateText)) return false;
  if (!/public_provider_config\s*\(|\bproviders\b/.test(llmConfigText)) return false;
  const text = llmConfigText.toLowerCase();
  const requiredProviders = ['deepseek', 'minimax', 'qwen', 'openai', 'custom'];
  if (requiredProviders.some((provider) => !text.includes(provider))) return false;
  const exposesModelChoices = /["']models["']\s*:/.test(llmConfigText) &&
    /["']default_model["']\s*:/.test(llmConfigText);
  const citesOfficialSources = /["']source_url["']\s*:/.test(llmConfigText) &&
    /(platform\.openai\.com|api-docs\.deepseek\.com|help\.aliyun\.com|alibabacloud\.com\/help\/en\/model-studio|platform\.minimax\.io|docs\.minimax\.io|official_docs)/i.test(llmConfigText);
  return !exposesModelChoices || !citesOfficialSources;
}

function hasLlmProviderCatalogOutdatedAgainstOfficialRefresh(llmConfigText: string, catalog: OfficialModelCatalog | null): boolean {
  if (!catalog) return false;
  if (!/public_provider_config\s*\(|\bPROVIDER_PRESETS\b|\bproviders\b/.test(llmConfigText)) return false;
  for (const provider of catalog.providers) {
    if (provider.id === 'custom') continue;
    if (!provider.default_model || provider.models.length === 0) continue;
    if (!llmConfigText.includes(provider.default_model)) return true;
  }
  return false;
}

function isFrontendUiApp(
  snapshot: ProjectSnapshot,
  files: string[],
  pkg?: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | null,
): boolean {
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  const hasFrontendFramework =
    snapshot.detected_frameworks.some((f) => ['react', 'next', 'vue', 'svelte'].includes(f)) ||
    ['react', 'next', 'vue', 'svelte', '@vitejs/plugin-react', 'vite'].some((dep) => dep in deps);
  const hasUiEntrypoint = files.some((f) =>
    /^(src\/)?App\.(tsx|jsx|ts|js|vue|svelte)$/.test(f) ||
    /^(src\/)?main\.(tsx|jsx|ts|js|vue|svelte)$/.test(f) ||
    /^(src\/)?index\.(tsx|jsx|ts|js|vue|svelte)$/.test(f) ||
    /^app\/.*\.(tsx|jsx|ts|js|vue|svelte)$/.test(f) ||
    /^pages\/.*\.(tsx|jsx|ts|js|vue|svelte)$/.test(f) ||
    f === 'index.html',
  );
  return hasFrontendFramework && hasUiEntrypoint;
}

function isUiBearingProject(
  snapshot: ProjectSnapshot,
  files: string[],
  pkg?: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | null,
): boolean {
  if (isFrontendUiApp(snapshot, files, pkg)) return true;
  return files.some((f) =>
    /^(index\.html|example\/index\.html)$/.test(f) ||
    /^(src|app|pages|components)\/.*\.(tsx|jsx|vue|svelte|html|css|scss)$/.test(f) ||
    /^(templates|static|public|example)\/.*\.(html|css|js)$/.test(f),
  );
}

function hasUiProductVerification(files: string[], scripts: Record<string, string>): boolean {
  const scriptBlob = Object.entries(scripts).map(([k, v]) => `${k}:${v}`).join('\n');
  return files.some((f) =>
    /^playwright\.config\.(ts|js|mjs|cjs)$/.test(f) ||
    /^cypress\.config\.(ts|js|mjs|cjs)$/.test(f) ||
    /^tests\/(ui|e2e)\//.test(f) ||
    /^e2e\//.test(f),
  ) || /\b(playwright|cypress|ui:check|ui:e2e|e2e)\b/i.test(scriptBlob);
}

function hasUiRuntimeRenderSmoke(files: string[], scripts: Record<string, string>): boolean {
  const scriptBlob = Object.entries(scripts).map(([k, v]) => `${k}:${v}`).join('\n');
  return files.some((f) =>
    /^scripts\/ui-render-smoke\.mjs$/.test(f) ||
    /^tests\/ui\/.*render.*\.(spec|test)\.(ts|js)$/.test(f),
  ) || /\b(ui:render-check|render-check|render-smoke|visual-smoke|pixel-smoke)\b/i.test(scriptBlob);
}

function detectSingleFileDemoEntry(files: string[]): string | null {
  const sourceFiles = files.filter((f) =>
    !f.includes('/') &&
    /^(demo|app|main|index|script|server|bot|game|notebook)\.(py|js|mjs|cjs|ts|html)$/.test(f) &&
    !/\.(test|spec)\./.test(f),
  );
  if (sourceFiles.length !== 1) return null;
  const hasStructuredLayout = files.some((f) =>
    /^(src|app|pages|components|templates|static|public|bin|lib|server|api)\//.test(f),
  );
  if (hasStructuredLayout) return null;
  return sourceFiles[0]!;
}

function hasSingleFileDemoIntakeHarness(files: string[], scripts: Record<string, string>): boolean {
  const scriptBlob = Object.entries(scripts).map(([k, v]) => `${k}:${v}`).join('\n');
  return files.includes('scripts/demo-runtime-check.mjs') &&
    files.includes('docs/demo-intake.md') &&
    (Object.keys(scripts).length === 0 || /\bdemo:intake-check\b|\bdemo-runtime-check\.mjs\b/.test(scriptBlob));
}

function isAllowedCrossRuntimeHarnessScript(key: string, script = ''): boolean {
  if ([
    'demo:intake-check',
    'cli:contract-check',
    'api:contract-check',
    'contract:check',
    'config:contract-check',
    'data:contract-check',
    'worker:contract-check',
    'ui:check',
    'ui:render-check',
    'ui:e2e',
  ].includes(key)) {
    return true;
  }
  return /\bnode\s+scripts\/(?:demo-runtime-check|cli-contract-check|api-contract-check|config-contract-check|data-contract-check|worker-contract-check)\.mjs\b/.test(script);
}

function isCliProject(
  files: string[],
  pkg?: { bin?: unknown; main?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | null,
): boolean {
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  return Boolean(pkg?.bin) ||
    files.some((f) => /^bin\/.+\.(js|mjs|cjs|ts)$/.test(f)) ||
    files.some((f) => /(^|\/)cli\.py$/.test(f)) ||
    ['commander', 'yargs', 'cac', 'clipanion', 'click', 'typer'].some((dep) => dep in deps);
}

function hasCliContractHarness(files: string[], scripts: Record<string, string>): boolean {
  const scriptBlob = Object.entries(scripts).map(([k, v]) => `${k}:${v}`).join('\n');
  return files.includes('scripts/cli-contract-check.mjs') &&
    files.includes('docs/cli-contract.md') &&
    /\bcli:contract-check\b|\bcli-contract-check\.mjs\b/.test(scriptBlob);
}

async function assessUiImplementationRisks(
  root: string,
  files: string[],
  snapshot: ProjectSnapshot,
  pkg?: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | null,
  projectSurfaceText = '',
): Promise<GapFinding[]> {
  const uiFiles = files.filter(isUiImplementationFile).slice(0, 180);
  const loaded = (await Promise.all(
    uiFiles.map(async (rel) => ({ rel, text: (await readTextSafe(path.join(root, rel))) ?? '' })),
  )).filter((f) => f.text.trim().length > 0);
  const allText = loaded.map((f) => f.text).join('\n');
  const nonCssText = loaded.filter((f) => !/\.(css|scss|sass)$/.test(f.rel)).map((f) => f.text).join('\n');
  const findings: GapFinding[] = [];
  const add = (
    category: string,
    severity: Severity,
    message: string,
    why: string,
    fix: string,
    related: string[],
  ) => {
    if (findings.some((f) => f.category === category)) return;
    findings.push(finding(category, severity, message, why, fix, related));
  };

  const pointerOnlyFiles = loaded.filter((f) => hasPointerOnlyInteractionRisk(f.text));
  const nonFocusableFlipFiles = loaded.filter((f) => hasNonFocusableFlipSurface(f.text));
  if (pointerOnlyFiles.length > 0 || nonFocusableFlipFiles.length > 0) {
    add(
      'ui_pointer_only_interaction',
      'high',
      'UI interaction relies on mouse-only hover/flyout behavior',
      'Touch and keyboard users need a focus, keyboard or touch path for panels and hover-only controls.',
      'Add focus/blur, keyboard and touch handlers, and make custom interactive regions focusable.',
      [...pointerOnlyFiles, ...nonFocusableFlipFiles].map((f) => f.rel),
    );
  }

  const hiddenCursorFiles = loaded.filter((f) => /\.(css|scss|sass|vue|svelte)$/.test(f.rel) && hasHiddenSystemCursorRisk(f.text));
  if (hiddenCursorFiles.length > 0) {
    add(
      'ui_hidden_system_cursor',
      'medium',
      'UI globally hides the system cursor',
      'A global hidden cursor can make the app uncomfortable or unusable on assistive, low-power or non-fine-pointer devices.',
      'Keep the system cursor visible by default and scope decorative custom cursors to safe pointer-fine contexts.',
      hiddenCursorFiles.map((f) => f.rel),
    );
  }

  const reactiveCursorFiles = loaded.filter((f) => /\.vue$/.test(f.rel) && hasReactiveMousemoveCursorRisk(f.text));
  if (reactiveCursorFiles.length > 0) {
    add(
      'ui_reactive_mousemove_cursor',
      'medium',
      'Vue cursor tracking updates reactive state directly on mousemove',
      'Purely visual pointer-following effects should avoid unnecessary component rerenders during high-frequency pointer events.',
      'Throttle pointer updates with requestAnimationFrame or update CSS variables imperatively for the cursor effect.',
      reactiveCursorFiles.map((f) => f.rel),
    );
  }

  const fixedTitleFiles = loaded.filter((f) => /\.(css|scss|sass|vue|svelte)$/.test(f.rel) && hasLargeFixedTitleType(f.text));
  if (fixedTitleFiles.length > 0) {
    add(
      'ui_fixed_title_scale',
      'medium',
      'Hero/title typography uses large fixed rem sizes',
      'Fixed display type can overflow on narrow viewports, zoomed browsers and translated text.',
      'Use clamp() and responsive constraints for display headings.',
      fixedTitleFiles.map((f) => f.rel),
    );
  }

  if (/position\s*:\s*sticky/i.test(allText) && /href\s*=\s*["']#[^"']+/i.test(allText) && !/scroll-(margin|padding)-top/i.test(allText)) {
    add(
      'ui_sticky_anchor_overlap',
      'medium',
      'Sticky header navigation lacks anchor offset handling',
      'Anchor links can land under a sticky top bar, hiding the section heading or first control.',
      'Add scroll-margin-top or scroll-padding-top for anchored sections.',
      loaded.filter((f) => /\.(css|scss|sass|vue|svelte)$/.test(f.rel)).map((f) => f.rel).slice(0, 6),
    );
  }

  const placeholderFiles = loaded.filter((f) => hasWeakUiProductCopy(f.text));
  if (placeholderFiles.length > 0) {
    add(
      'ui_placeholder_copy',
      'medium',
      'UI still contains placeholder or weak product copy',
      'Temporary or generic copy makes an otherwise polished interface read as unfinished.',
      'Replace placeholder and low-information copy with specific product, service or user-facing copy.',
      placeholderFiles.map((f) => f.rel),
    );
  }

  const hostedServiceClaimFiles = loaded.filter((f) => hasUnimplementedHostedServiceClaim(f.text));
  if (
    hostedServiceClaimFiles.length > 0 &&
    !hasHostedFileProcessingImplementationEvidence(files, pkg, projectSurfaceText)
  ) {
    add(
      'ui_unimplemented_hosted_service_claim',
      'high',
      'UI promises hosted file processing without backend implementation evidence',
      'A product surface should not tell users they can upload files, process work or receive generated artifacts unless the repository contains the API, worker and storage boundary that makes that promise true.',
      'Either remove or explicitly mark the hosted service as unavailable in beta, or add verified API routes, storage handling, job processing and artifact retrieval tests.',
      hostedServiceClaimFiles.map((f) => f.rel),
    );
  }

  const navFiles = loaded.filter((f) => hasNavWithoutAccessibleName(f.text));
  if (navFiles.length > 0) {
    add(
      'ui_navigation_semantics',
      'medium',
      'Navigation landmarks are missing accessible names',
      'Named navigation regions help screen-reader users distinguish primary, secondary and footer navigation.',
      'Add aria-label or aria-labelledby to nav elements.',
      navFiles.map((f) => f.rel),
    );
  }

  const cssCleanupFiles = loaded.filter((f) => /\.(css|scss|sass)$/.test(f.rel) && needsCssCleanup(f.text, nonCssText));
  if (cssCleanupFiles.length > 0) {
    add(
      'ui_css_cleanup_needed',
      'low',
      'CSS contains duplicate or unused selector residue',
      'Duplicated and stale selectors make UI behavior harder to reason about and increase drift between implementations.',
      'Deduplicate repeated selector blocks and remove selectors that no longer map to markup.',
      cssCleanupFiles.map((f) => f.rel),
    );
  }

  const drift = findVariantStyleDrift(loaded);
  if (drift.length > 0) {
    add(
      'ui_variant_style_drift',
      'low',
      'Parallel UI variants have drifted stylistically',
      'When a framework implementation and static/example implementation diverge, fixes land in one surface but not the other.',
      'Normalize shared selector declarations or consolidate the duplicated style source.',
      drift,
    );
  }

  void snapshot;
  return findings;
}

function isUiImplementationFile(file: string): boolean {
  return /^(index\.html|package\.json)$/.test(file) ||
    /^(src|app|pages|components|styles|templates|static|public|example)\/.*\.(tsx|jsx|ts|js|vue|svelte|html|css|scss|sass)$/.test(file);
}

function hasPointerOnlyInteractionRisk(text: string): boolean {
  const usesMouseOnlyEvent = /(@mouseenter|@mouseleave|onMouseEnter|onMouseLeave|addEventListener\(\s*["']mouse(?:enter|leave)["'])/.test(text);
  if (!usesMouseOnlyEvent) return false;
  return !/(@focus|@blur|focusin|focusout|touchstart|touchend|pointerenter|pointerleave|keydown|keyup|tabindex)/i.test(text);
}

function hasNonFocusableFlipSurface(text: string): boolean {
  return /<[^>]+(?:data-flip-panel|class=["'][^"']*\bflip-panel\b[^"']*)[^>]*>/i.test(text) &&
    !/<[^>]+(?:data-flip-panel|class=["'][^"']*\bflip-panel\b[^"']*)[^>]*(?:tabindex|href=|role=["']button|<button)/i.test(text);
}

function hasHiddenSystemCursorRisk(text: string): boolean {
  if (!/cursor\s*:\s*none/i.test(text)) return false;
  return !/@media\s*\(\s*(?:pointer|hover)\s*:\s*(?:fine|hover)\s*\)/i.test(text);
}

function hasReactiveMousemoveCursorRisk(text: string): boolean {
  return /mousemove/i.test(text) &&
    /\bref\s*\(/.test(text) &&
    /\.value\s*=\s*(?:event\.)?client[XY]|\b(?:cursor|mask)[XY]\.value\s*=/.test(text) &&
    !/requestAnimationFrame|style\.setProperty/i.test(text);
}

function hasLargeFixedTitleType(text: string): boolean {
  const re = /font-size\s*:\s*([0-9]+(?:\.[0-9]+)?)rem\s*;/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const value = Number(match[1]);
    const context = text.slice(Math.max(0, match.index - 120), match.index + 120);
    if (value >= 4 && /(hero|title|headline|display|brand|h1)/i.test(context) && !/clamp\s*\(/i.test(context)) {
      return true;
    }
  }
  return false;
}

function hasNavWithoutAccessibleName(text: string): boolean {
  return (text.match(/<nav\b[^>]*>/gi) ?? []).some((tag) => !/\baria-(?:label|labelledby)=/i.test(tag));
}

function hasWeakUiProductCopy(text: string): boolean {
  return /this is (just )?a beta|beta version|lorem ipsum|placeholder copy|todo copy|coming soon|under construction|work in progress|stay tuned|welcome to (my|our) (website|site)|this is my (website|portfolio)|just another (website|portfolio|app)|a common student/i.test(text);
}

function hasUnimplementedHostedServiceClaim(text: string): boolean {
  if (/not\s+(?:a\s+)?hosted|not\s+active|not\s+available|not\s+.*service\s+yet|beta\s+locally|use\s+the\s+beta\s+locally|intentionally\s+not\s+(?:active|exposed)/i.test(text)) {
    return false;
  }
  const fileInputClaim = /type=["']file["']|data-upload-form|data-demo-upload|data-return-format|accept=["'][^"']*\.(?:zip|7z|rar|tar)/i.test(text);
  const uploadClaim = /\bupload(?:ing)?\b.{0,80}\b(?:demo|file|archive|project|zip|7z|rar|tar)\b|\b(?:demo|file|archive|project)\b.{0,80}\bupload(?:ing)?\b/i.test(text);
  const processingClaim = /\b(?:process|convert|producti[sz]e|optimi[sz]e|transform|queue|run)\b.{0,80}\b(?:demo|file|archive|project|artifact|zip)\b/i.test(text);
  const returnClaim = /\b(?:receive|return|download|deliver|generate)\b.{0,100}\b(?:product\s+zip|productized\s+zip|artifact|zip\s+artifact|generated\s+project|product\s+artifact)\b/i.test(text);
  const strongArtifactClaim = /\b(?:product\s+zip|productized\s+zip|product\s+artifact|zip\s+artifact)\b/i.test(text);
  return (fileInputClaim && (uploadClaim || processingClaim || returnClaim || strongArtifactClaim)) ||
    (uploadClaim && (processingClaim || returnClaim || strongArtifactClaim)) ||
    /Upload a demo\.\s*Receive a product zip/i.test(text);
}

function hasHostedFileProcessingImplementationEvidence(
  files: string[],
  pkg?: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | null,
  projectSurfaceText = '',
): boolean {
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  const serviceDeps = [
    'express',
    'fastify',
    'koa',
    'hono',
    '@nestjs/core',
    'next',
    'nuxt',
    'nitro',
    '@supabase/supabase-js',
    'multer',
    'busboy',
    'formidable',
    'uploadthing',
    'aws-sdk',
    '@aws-sdk/client-s3',
    'bullmq',
    'bull',
    'bee-queue',
    'celery',
    'rq',
    'flask',
    'fastapi',
    'django',
  ];
  if (serviceDeps.some((dep) => dep in deps)) return true;
  if (files.some((f) =>
    /^api\/.+\.(ts|tsx|js|mjs|cjs|py)$/.test(f) ||
    /^pages\/api\//.test(f) ||
    /^app\/api\/.+\/route\.(ts|js)$/.test(f) ||
    /^(server|backend|routes|workers?|jobs|tasks)\//.test(f) ||
    /(^|\/)(server|app|api|worker|queue|storage)\.(ts|js|mjs|cjs|py)$/.test(f) ||
    /^supabase\/migrations\/.+\.sql$/.test(f)
  )) {
    return true;
  }
  return /@app\.(?:route|post)\(|FastAPI\s*\(|APIRouter\s*\(|express\s*\(|fastify\s*\(|new\s+Hono\s*\(|router\.(?:post|put)|multer|busboy|formidable|supabase\.storage|createSignedUploadUrl|S3Client|PutObjectCommand|new\s+Queue|Celery\(|BackgroundTasks/i.test(projectSurfaceText);
}

function needsCssCleanup(css: string, markupText: string): boolean {
  const blocks = extractCssRuleBlocks(css);
  const seen = new Set<string>();
  if (blocks.some((block) => {
    if (seen.has(block)) return true;
    seen.add(block);
    return false;
  })) return true;

  const classes = Array.from(css.matchAll(/\.([_a-zA-Z][\w-]*)/g)).map((m) => m[1]!).filter((c) => !/^(\d|is|has|not|where)$/.test(c));
  const unique = Array.from(new Set(classes));
  const unused = unique.filter((className) => !new RegExp(`(^|[^\\w-])${escapeRegex(className)}([^\\w-]|$)`).test(markupText));
  return unused.length >= 1 && unused.some((c) => /eyebrow|unused|legacy|old|deprecated/i.test(c));
}

function extractCssRuleBlocks(css: string): string[] {
  const blocks: string[] = [];
  const re = /([^{}]+)\{/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(css))) {
    const selector = match[1]!.trim();
    if (!selector || selector.startsWith('@')) continue;
    const end = css.indexOf('}', re.lastIndex);
    if (end === -1) continue;
    const body = css.slice(re.lastIndex, end).trim();
    const normalized = `${selector.replace(/\s+/g, ' ')}{${body.replace(/\s+/g, ' ')}}`;
    blocks.push(normalized);
  }
  return blocks;
}

function findVariantStyleDrift(files: Array<{ rel: string; text: string }>): string[] {
  const src = files.find((f) => f.rel === 'src/style.css');
  const example = files.find((f) => f.rel === 'example/style.css');
  if (!src || !example) return [];
  const checks = [
    ['.brand', 'letter-spacing'],
    ['.hero-title__name', 'font-size'],
    ['.hero-title__name--cn', 'font-size'],
  ] as const;
  const declarationDrifted = checks.some(([selector, property]) => {
    const a = extractCssDeclaration(src.text, selector, property);
    const b = extractCssDeclaration(example.text, selector, property);
    return Boolean(a && b && normalizeCssValue(a) !== normalizeCssValue(b));
  });
  const cursorMediaDrifted = hasMobileCursorCoreOnly(src.text) !== hasMobileCursorCoreOnly(example.text);
  const drifted = declarationDrifted || cursorMediaDrifted;
  return drifted ? [src.rel, example.rel] : [];
}

function extractCssDeclaration(css: string, selector: string, property: string): string | null {
  const escaped = escapeRegex(selector);
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'm'));
  const body = match?.[1] ?? '';
  const prop = body.match(new RegExp(`${escapeRegex(property)}\\s*:\\s*([^;]+);`, 'i'));
  return prop?.[1]?.trim() ?? null;
}

function hasMobileCursorCoreOnly(css: string): boolean {
  const media = css.match(/@media\s*\([^)]*max-width[^)]*\)\s*\{[\s\S]*?\.cursor-core\s*\{[\s\S]*?\n\}/i)?.[0] ?? '';
  return Boolean(media) && !/\.cursor-capture\s*,\s*\n\s*\.cursor-core/.test(media);
}

function normalizeCssValue(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isSocialDeductionGame(gameText: string, readme: string): boolean {
  const blob = `${gameText}\n${readme}`.toLowerCase();
  const hasGameShape = /GAME_MODES|GameMaster|class\s+\w*Game|def\s+winner|resolve_vote_result/.test(gameText);
  if (!hasGameShape) return false;

  const hasWolfFaction = /werewolf|wolves|wolf_team|wolf team|狼人|狼方|狼队/.test(blob);
  if (!hasWolfFaction) return false;

  const roleSignals = countSignals(blob, [
    /werewolf|wolves|wolf_team|wolf team|狼人|狼方|狼队/,
    /seer|预言家/,
    /witch|女巫/,
    /villager|村民|平民/,
    /hunter|猎人/,
    /guard|守卫/,
    /idiot|白痴/,
  ]);
  const phaseOrRuleSignals = countSignals(blob, [
    /vote|投票|放逐|公投/,
    /night|夜晚|天黑|夜间/,
    /day|白天|发言|讨论/,
    /alive|dead|死亡|存活|出局/,
    /kill|poison|save|check|guard|击杀|毒|救|查验|守护/,
    /winner|win condition|胜利|阵营/,
  ]);
  const hasRoleConfig = /GAME_MODES[\s\S]{0,800}(roles|werewolf|狼人)|["']roles["']\s*:/.test(gameText);

  return (roleSignals >= 2 || hasRoleConfig) && phaseOrRuleSignals >= 1;
}

function isAgentFacingSocialDeductionGame(text: string): boolean {
  const blob = text.toLowerCase();
  const agentSignals = countSignals(blob, [
    /\bllm\b|large language model|大模型/,
    /\bagents?\b|multi[-_ ]?agent|智能体/,
    /\bopenai\b|chat completions?|model provider|api key|base_url|模型|供应商/,
    /\bprompt\b|system_prompt|提示词/,
    /\breplay\b|transcript|复盘|观战|observer/,
  ]);
  const humanProductSignals = countSignals(blob, [
    /\bvoice chat\b|语音/,
    /\bmatchmaking\b|匹配/,
    /\branked\b|leaderboard|排位|排行榜/,
    /\bavatar\b|cosmetic|skin|皮肤/,
  ]);
  return agentSignals >= 2 && agentSignals >= humanProductSignals;
}

function countSignals(text: string, patterns: RegExp[]): number {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function hasSocialDeductionModeValidation(rulesText: string): boolean {
  return /def\s+validate_mode_config\s*\(/.test(rulesText) &&
    /def\s+validate_game_modes\s*\(/.test(rulesText) &&
    /werewolf/.test(rulesText) &&
    /role_distribution/.test(rulesText);
}

function hasSocialDeductionModeValidationTests(testText: string): boolean {
  return /validate_mode_config|validate_game_modes/.test(testText) &&
    /wolf_majority|wolf majority|狼人.*过半|阵营|balanced mode|mode config/i.test(testText);
}

function hasSocialDeductionModeStartupGuard(gameText: string): boolean {
  return /validate_game_modes\s*\(\s*GAME_MODES\s*\)/.test(gameText) &&
    /raise\s+ValueError|RuntimeError|if\s+not\s+[^:\n]*\["ok"\]\s*:/.test(gameText);
}

async function assessSocialDeductionProductMaturity(
  root: string,
  files: string[],
): Promise<ProductMaturityAssessment> {
  const integration = await assessSocialDeductionRuntimeIntegration(root, files);
  const implementationFiles = files.filter((f) =>
    /^(app|game|rules|player|prompts|config|wsgi)\.py$/.test(f) ||
    /^(accounts|auth|profiles|users|lobby|rooms|matchmaking|communication|moderation|ranking|ranked|history|storage|roles_catalog|role_registry|liveops|admin|host_controls)\.py$/.test(f) ||
    /(^|\/)tests?\/.*\.(py|ts|js)$/.test(f) ||
    /(^|\/)(src|server|backend|api|routes|models|services)\//.test(f),
  );
  const snippets = await Promise.all(
    implementationFiles.slice(0, 120).map(async (file) => `${file}\n${(await readTextSafe(path.join(root, file))) ?? ''}`),
  );
  const blob = snippets.join('\n').toLowerCase();
  const hasFile = (pattern: RegExp): boolean => files.some((file) => pattern.test(file));
  const hasText = (pattern: RegExp): boolean => pattern.test(blob);
  const capabilities = [
    capability(
      'core_rules_engine',
      'Tested deterministic game rules',
      hasFile(/^rules\.py$/) && hasFile(/(^|\/)tests?\/.*rules.*\.py$/) && hasText(/resolve_vote_result|winner_from_alive_roles/),
      ['rules.py', 'tests/test_rules.py'],
    ),
    capability(
      'production_runtime_baseline',
      'Deployable runtime with health, config and CI/test hooks',
      hasText(/healthz/) && hasFile(/^dockerfile$/i) && (hasFile(/^wsgi\.py$/) || hasText(/gunicorn|wsgi/)) && hasFile(/(^|\/)\.github\/workflows\//),
      ['Dockerfile', 'wsgi.py', '.github/workflows'],
    ),
    capability(
      'account_identity',
      'Account identity and player profiles',
      hasText(/\b(user|account|profile|login|logout|session|jwt|oauth|password_hash)\b/) &&
        hasFile(/(^|\/)(models|users|auth|accounts|profiles)(\.py|\/)/),
      ['auth/users/accounts module'],
    ),
    capability(
      'lobby_matchmaking',
      'Lobby, room and matchmaking lifecycle',
      hasText(/\b(lobby|room|matchmaking|match_queue|ready_check|invite|party)\b/) &&
        hasFile(/(^|\/)(lobby|rooms|matchmaking|services)(\.py|\/)/),
      ['lobby/room/matchmaking module'],
    ),
    capability(
      'realtime_social_communication',
      'Real-time human communication layer',
      hasText(/\b(socketio|websocket|websocket-client|webrtc|rtcpeerconnection|getusermedia|mediarecorder|microphone permission)\b/),
      ['voice/chat/websocket implementation'],
    ),
    capability(
      'moderation_trust_safety',
      'Moderation, reporting and abuse controls',
      hasText(/\b(report_player|moderation|mute|block_user|ban|profanity|toxicity|anti_abuse|grief|afk|挂机|举报)\b/),
      ['moderation/report/block controls'],
    ),
    capability(
      'ranked_season_progression',
      'Ranked, season and leaderboard progression',
      hasText(/\b(rank|ranked|season|leaderboard|rating|mmr|elo|division|tier)\b/),
      ['ranked/season/leaderboard implementation'],
    ),
    capability(
      'persistent_match_history',
      'Persistent match history and replay storage',
      hasText(/\b(sqlalchemy|sqlite|postgres|mysql|redis|database|migration|match_history|replay_store)\b/) &&
        hasText(/\b(match|game).*(history|record|replay|archive)\b/),
      ['database-backed match history'],
    ),
    capability(
      'content_scale_roles_modes',
      'Large role and mode content surface',
      socialDeductionRoleSurfaceScore(blob) >= 12 || hasText(/\brole_registry|100\+ unique roles|battle pass|event role\b/),
      ['role registry or broad mode catalog'],
    ),
    capability(
      'liveops_economy_events',
      'Live operations, cosmetics or event economy',
      hasText(/\b(shop|skin|avatar item|cosmetic|currency|battle pass|quest|reward track|inventory|talisman)\b/),
      ['events/shop/cosmetics/rewards'],
    ),
    capability(
      'admin_observability_controls',
      'Admin, audit and operational observability',
      hasText(/\b(admin|metrics|prometheus|tracing|audit|analytics|dashboard|incident|rate_limit)\b/),
      ['admin/metrics/audit controls'],
    ),
    capability(
      'custom_host_controls',
      'Custom games and host controls',
      hasText(/\b(custom game|host mode|host controls|spectator|private room|room settings|skip discussion|anonymous players)\b/),
      ['custom room/host mode controls'],
    ),
    capability(
      'runtime_product_integration',
      'Runtime integration of product systems',
      integration.has_runtime_integration,
      ['app.py/game.py imports or invokes product systems'],
    ),
    capability(
      'user_facing_product_workflows',
      'User-facing product workflows',
      integration.has_user_facing_workflows,
      ['Flask routes/templates expose product workflows'],
    ),
    capability(
      'end_to_end_product_workflow_verification',
      'End-to-end product workflow verification',
      integration.has_end_to_end_verification,
      ['tests exercise product workflows through the running app surface'],
    ),
  ];
  const met = capabilities.filter((c) => c.met).length;
  const rawScore = Math.round((met / capabilities.length) * 100);
  const score = integration.has_generated_status_stub ? Math.min(rawScore, 60) : rawScore;
  const missing = capabilities.filter((c) => !c.met && c.required_for_market_parity).map((c) => c.label);
  const level = productMaturityLevel(score, missing.length);
  return {
    domain: 'social_deduction_game',
    target_market: 'mature online werewolf/social deduction product',
    score,
    level,
    summary: integration.has_generated_status_stub
      ? `Detected ${met}/${capabilities.length} market-parity capability signals, capped at ${score}/100 because user-facing workflows are generated status stubs rather than behavior-level product flows.`
      : `Detected ${met}/${capabilities.length} market-parity capabilities for a social deduction product.`,
    capabilities,
    missing_capabilities: missing,
    references: [
      'Wolvesville: online/friends/global play, avatar customization, ranked games, items and community events',
      'Wolvesville Creator Program: 50M+ downloads, 16-player games, 100+ unique roles, multi-platform',
      'Official Chinese Werewolf listings: real-time voice, fast matchmaking, voice judge guidance, modes, seasons and governance',
    ],
  };
}

async function assessAgentSocialDeductionTheaterMaturity(
  root: string,
  files: string[],
): Promise<ProductMaturityAssessment> {
  const implementationFiles = files.filter((f) =>
    /^(app|game|rules|player|prompts|config|llm_config|wsgi|main|diag)\.py$/.test(f) ||
    /^(replay|evaluation|evaluations|observability|metrics|storage|history)\.py$/.test(f) ||
    /(^|\/)tests?\/.*\.(py|ts|js)$/.test(f) ||
    /(^|\/)(src|server|backend|api|routes|models|services|templates|static|docs|scripts)\//.test(f) ||
    /^README\.md$|^Dockerfile$|^pyproject\.toml$|^requirements\.txt$/.test(f),
  );
  const snippets = await Promise.all(
    implementationFiles.slice(0, 160).map(async (file) => `${file}\n${(await readTextSafe(path.join(root, file))) ?? ''}`),
  );
  const blob = snippets.join('\n').toLowerCase();
  const hasFile = (pattern: RegExp): boolean => files.some((file) => pattern.test(file));
  const hasText = (pattern: RegExp): boolean => pattern.test(blob);
  const hasTests = hasFile(/(^|\/)tests?\/.*\.(py|ts|js)$/);
  const capabilities = [
    capability(
      'deterministic_rules_engine',
      'Tested deterministic rules engine',
      hasFile(/^rules\.py$/) && hasFile(/(^|\/)tests?\/.*rules.*\.py$/) && hasText(/resolve_vote_result|winner_from_alive_roles|validate_mode_config/),
      ['rules.py', 'tests/test_rules.py'],
    ),
    capability(
      'agent_model_configuration',
      'Per-session agent model and provider configuration',
      hasText(/public_provider_config|provider.*model|model.*provider|api_key|base_url|openai[-_ ]compatible/) &&
        hasText(/request\.json|session|game_config|player.*config|per[-_ ]session/),
      ['llm_config.py', 'app.py', 'templates/index.html'],
    ),
    capability(
      'official_model_catalog',
      'Official provider/model catalog with safe defaults',
      hasText(/deepseek|qwen|minimax|openai/) &&
        hasText(/default_model|models|source_url|official|provider catalog/),
      ['llm_config.py', 'docs/model-providers.md'],
    ),
    capability(
      'observer_product_surface',
      'Observer-facing theater workflow',
      hasText(/eventsource|\/stream\/|sse|observer|观战|thinking|timeline|vote_start|game_over/) &&
        hasText(/start|mode|player|phase|state/),
      ['templates/index.html', 'app.py'],
    ),
    capability(
      'durable_replay_transcripts',
      'Durable replay and transcript storage',
      hasText(/replay|transcript|match_history|event_log|timeline/) &&
        hasText(/sqlite|jsonl|database|persist|storage|archive|download/),
      ['replay.py', 'history.py', 'tests/test_replay.py'],
    ),
    capability(
      'simulation_evaluation_harness',
      'Repeatable simulation and evaluation harness',
      hasText(/seed|batch|evaluation|benchmark|regression|simulation|parallel universe|平行宇宙/) &&
        hasText(/pytest|test_eval|run_many|aggregate|compare/),
      ['evaluation.py', 'tests/test_eval_harness.py', 'scripts'],
    ),
    capability(
      'agent_behavior_guardrails',
      'Agent prompt and invalid-action guardrails',
      hasText(/role secrecy|不要.*身份|invalid action|fallback|guardrail|strictly|工具|tool/) &&
        hasText(/prompt|system_prompt|decide|speak/),
      ['prompts.py', 'player.py', 'tests/test_prompts.py'],
    ),
    capability(
      'observability_failure_diagnostics',
      'Runtime observability and failure diagnostics',
      hasText(/healthz|metrics|trace|audit|logger|diagnostic|diag|error|retry/) &&
        hasText(/llm|agent|model|provider/),
      ['diag.py', 'app.py', 'tests/test_observability.py'],
    ),
    capability(
      'api_contract_verification',
      'API and configuration contract tests',
      hasTests && hasText(/test_client|\/healthz|\/config|\/start|\/stream|provider|model/),
      ['tests/test_app.py', 'tests/test_llm_config.py'],
    ),
    capability(
      'deployable_runtime_baseline',
      'Deployable runtime with CI hooks',
      hasFile(/^dockerfile$/i) &&
        (hasFile(/^wsgi\.py$/) || hasText(/gunicorn|wsgi/)) &&
        (hasFile(/(^|\/)\.github\/workflows\//) || hasFile(/^pyproject\.toml$/)) &&
        hasTests,
      ['Dockerfile', 'wsgi.py', '.github/workflows', 'pyproject.toml'],
    ),
  ];
  const met = capabilities.filter((c) => c.met).length;
  const score = Math.round((met / capabilities.length) * 100);
  const missing = capabilities.filter((c) => !c.met && c.required_for_market_parity).map((c) => c.label);
  return {
    domain: 'agent_social_deduction_theater',
    target_market: 'mature agent-facing werewolf simulation and observer product',
    score,
    level: productMaturityLevel(score, missing.length),
    summary: `Detected ${met}/${capabilities.length} product-grade capabilities for an agent-facing social deduction theater.`,
    capabilities,
    missing_capabilities: missing,
    references: [
      'Agent-facing parity: configurable model providers and per-session credentials',
      'Agent-facing parity: durable event transcripts, replay and observability for observer trust',
      'Agent-facing parity: repeatable simulation/evaluation harnesses instead of human matchmaking-first features',
    ],
  };
}

interface SocialDeductionRuntimeIntegrationAssessment {
  has_backbone_modules: boolean;
  has_generated_status_stub: boolean;
  has_runtime_integration: boolean;
  has_user_facing_workflows: boolean;
  has_end_to_end_verification: boolean;
  related_files: string[];
}

const SOCIAL_PRODUCT_BACKBONE_MODULES = [
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
];

async function assessSocialDeductionRuntimeIntegration(
  root: string,
  files: string[],
): Promise<SocialDeductionRuntimeIntegrationAssessment> {
  const backboneModules = files.filter((file) => SOCIAL_PRODUCT_BACKBONE_MODULES.includes(file));
  const runtimeFiles = files.filter((file) =>
    /^(app|game|main|server|wsgi)\.py$/.test(file) ||
    /^templates\/.*\.(html|jinja2?)$/.test(file) ||
    /^static\/.*\.(js|ts|html)$/.test(file) ||
    /^src\/.*\.(py|js|ts|tsx|jsx|vue)$/.test(file),
  );
  const testFiles = files.filter((file) => /(^|\/)tests?\/.*\.(py|ts|js|tsx|jsx)$/.test(file));
  const runtimeBlob = (await Promise.all(
    runtimeFiles.slice(0, 100).map((file) => readTextSafe(path.join(root, file))),
  )).filter((text): text is string => Boolean(text)).join('\n').toLowerCase();
  const testBlob = (await Promise.all(
    testFiles.slice(0, 80).map((file) => readTextSafe(path.join(root, file))),
  )).filter((text): text is string => Boolean(text)).join('\n').toLowerCase();

  const hasBackboneModules = backboneModules.length > 0;
  const hasGeneratedStatusStub = hasGeneratedSocialProductStatusStub(runtimeBlob);
  const hasShallowStatusVerification = hasGeneratedStatusStub && hasShallowSocialProductStatusTest(testBlob);
  const hasRuntimeIntegration =
    socialProductRuntimeSignalCount(runtimeBlob) >= 3 ||
    /\b(from|import)\s+(accounts|lobby|communication|moderation|ranking|history|roles_catalog|liveops|admin|host_controls)\b/.test(runtimeBlob) ||
    /\b(accountstore|lobbymanager|websocketpresencehub|moderationlog|rankedseasonleaderboard|sqlitematchhistory|liveopsstore|adminconsole|hostcontrols)\b/.test(runtimeBlob);
  const hasUserFacingWorkflows = !hasGeneratedStatusStub && socialProductRouteSignalCount(runtimeBlob) >= 4;
  const hasEndToEndVerification =
    !hasShallowStatusVerification &&
    /\b(test_client|client\.(get|post|put|delete)|page\.goto|fetch\()/.test(testBlob) &&
    socialProductRouteSignalCount(testBlob) >= 3;

  return {
    has_backbone_modules: hasBackboneModules,
    has_generated_status_stub: hasGeneratedStatusStub,
    has_runtime_integration: hasRuntimeIntegration,
    has_user_facing_workflows: hasUserFacingWorkflows,
    has_end_to_end_verification: hasEndToEndVerification,
    related_files: Array.from(new Set([
      ...backboneModules,
      ...runtimeFiles.filter((file) => /^(app|game)\.py$|^templates\//.test(file)),
      ...testFiles.filter((file) => /test_(app|product|e2e|ui|workflow)|\.(spec|test)\./.test(file)),
    ])).slice(0, 16),
  };
}

function hasGeneratedSocialProductStatusStub(text: string): boolean {
  return (
    /_d2p_product_status|demo2project:\s*social product runtime integration/.test(text) ||
    (/["'`]\/product\//.test(text) &&
      /\bworkflow\b/.test(text) &&
      /\benabled\b/.test(text) &&
      /\b(demo_player|demo_room|return\s+_d2p_product_status)\b/.test(text))
  );
}

function hasShallowSocialProductStatusTest(text: string): boolean {
  return (
    /\bstatus_code\s*==\s*200\b/.test(text) &&
    (/\bworkflow\b/.test(text) || /\benabled\b/.test(text)) &&
    /["'`]\/product\//.test(text)
  );
}

function socialProductRuntimeSignalCount(text: string): number {
  return countSignals(text, [
    /\b(accountstore|profile|login|session|accounts?)\b/,
    /\b(lobbymanager|lobby|room|matchmaking|ready_check|invite)\b/,
    /\b(websocket|presence|chat|voice|communication)\b/,
    /\b(moderation|report_player|report|mute|block_user|ban|anti_abuse)\b/,
    /\b(rankedseasonleaderboard|ranked|leaderboard|rating|mmr|season)\b/,
    /\b(sqlitematchhistory|match_history|replay_store|history|replay)\b/,
    /\b(role_registry|roles_catalog|mode_catalog|role catalog)\b/,
    /\b(liveops|inventory|shop|cosmetic|currency|reward)\b/,
    /\b(adminconsole|admin|metrics|audit|rate_limit)\b/,
    /\b(hostcontrols|host controls|private_room|room settings|custom game)\b/,
  ]);
}

function socialProductRouteSignalCount(text: string): number {
  return countSignals(text, [
    /["'`](?:\/[^"'`]*)?(?:login|profile|session|account)s?\b/,
    /["'`](?:\/[^"'`]*)?(?:lobby|room|matchmaking|ready|invite)s?\b/,
    /["'`](?:\/[^"'`]*)?(?:chat|voice|presence|websocket|communication)s?\b/,
    /["'`](?:\/[^"'`]*)?(?:moderation|report|mute|block|ban)s?\b/,
    /["'`](?:\/[^"'`]*)?(?:ranked|leaderboard|rating|season)s?\b/,
    /["'`](?:\/[^"'`]*)?(?:history|replay|match-history)s?\b/,
    /["'`](?:\/[^"'`]*)?(?:roles|modes|catalog)s?\b/,
    /["'`](?:\/[^"'`]*)?(?:shop|inventory|cosmetic|reward|liveops)s?\b/,
    /["'`](?:\/[^"'`]*)?(?:admin|metrics|audit)s?\b/,
    /["'`](?:\/[^"'`]*)?(?:host|private-room|room-settings|custom-game)s?\b/,
  ]);
}

async function assessWebUiProductMaturity(
  root: string,
  files: string[],
  pkg?: { scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | null,
): Promise<ProductMaturityAssessment> {
  const implementationFiles = files.filter((f) =>
    /^(index\.html|package\.json|vite\.config\.(ts|js)|next\.config\.(ts|js|mjs))$/.test(f) ||
    /^(src|app|pages|components|styles|tests|e2e)\//.test(f) &&
      /\.(tsx|jsx|ts|js|vue|svelte|css|scss|sass|html)$/.test(f),
  );
  const snippets = await Promise.all(
    implementationFiles.slice(0, 160).map(async (file) => `${file}\n${(await readTextSafe(path.join(root, file))) ?? ''}`),
  );
  const blob = snippets.join('\n').toLowerCase();
  const scripts = pkg?.scripts ?? {};
  const scriptBlob = Object.entries(scripts).map(([k, v]) => `${k}:${v}`).join('\n').toLowerCase();
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  const hasFile = (pattern: RegExp): boolean => files.some((file) => pattern.test(file));
  const hasText = (pattern: RegExp): boolean => pattern.test(blob);
  const hasScript = (pattern: RegExp): boolean => pattern.test(scriptBlob);
  const capabilities = [
    capability(
      'build_pipeline',
      'Production build pipeline',
      hasScript(/\bbuild\b/) && (hasFile(/^vite\.config\.(ts|js)$/) || hasFile(/^next\.config\.(ts|js|mjs)$/) || 'vite' in deps || 'next' in deps),
      ['package.json build script', 'bundler config'],
    ),
    capability(
      'component_or_unit_tests',
      'Component or unit tests for UI behavior',
      hasFile(/(^|\/)(tests?|src)\/.*\.(test|spec)\.(tsx|jsx|ts|js|vue)$/) && hasScript(/\b(test|vitest|jest)\b/),
      ['tests/*.spec.tsx', 'package.json test script'],
    ),
    capability(
      'browser_visual_smoke',
      'Browser-level visual smoke checks',
      hasUiProductVerification(files, scripts),
      ['playwright.config.ts', 'tests/ui/smoke.spec.ts', 'scripts/ui-product-check.mjs'],
    ),
    capability(
      'runtime_render_smoke',
      'Runtime rendered UI visibility checks',
      hasUiRuntimeRenderSmoke(files, scripts),
      ['scripts/ui-render-smoke.mjs', 'screenshots/pixel/overflow assertions'],
    ),
    capability(
      'responsive_layout',
      'Responsive layout behavior',
      hasText(/@media|@container|container-query|minmax\(|clamp\(|grid-template|flex-wrap|sm:|md:|lg:/),
      ['responsive CSS or utility classes'],
    ),
    capability(
      'accessibility_semantics',
      'Accessibility semantics and labels',
      hasText(/aria-|role=|alt=|<label|htmlfor=|focus-visible|sr-only|tabindex/),
      ['ARIA/labels/focus semantics'],
    ),
    capability(
      'interactive_states',
      'Interactive and disabled states',
      hasText(/:hover|:focus|:active|disabled|data-state|on(click|change|submit|keydown)|cursor:/),
      ['hover/focus/disabled/handler states'],
    ),
    capability(
      'loading_error_empty_states',
      'Loading, error and empty states',
      hasText(/loading|skeleton|spinner|error|empty|no results|not found|retry|fallback|pending|failed/),
      ['loading/error/empty UI states'],
    ),
    capability(
      'navigation_routing',
      'Navigation or routing surface',
      hasText(/react-router|<nav|href=|router\.push|useNavigate|next\/link|app\/.*page|pages\//),
      ['navigation/routing code'],
    ),
    capability(
      'design_tokens',
      'Design tokens or theme system',
      hasText(/:root|--[a-z0-9-]+:|tailwind\.config|theme|design-token|color-scheme|font-family|spacing/),
      ['CSS variables/theme/tokens'],
    ),
    capability(
      'deployment_ready',
      'Static UI deployment readiness',
      hasFile(/^\.github\/workflows\//) || hasFile(/^Dockerfile$/i) || hasFile(/^(vercel|netlify)\.json$/) || hasScript(/\bpreview\b/),
      ['CI/deploy config or preview script'],
    ),
  ];
  const met = capabilities.filter((c) => c.met).length;
  const score = Math.round((met / capabilities.length) * 100);
  const missing = capabilities.filter((c) => !c.met && c.required_for_market_parity).map((c) => c.label);
  return {
    domain: 'web_ui_app',
    target_market: 'shippable responsive web UI product',
    score,
    level: productMaturityLevel(score, missing.length),
    summary: `Detected ${met}/${capabilities.length} shippable UI capabilities.`,
    capabilities,
    missing_capabilities: missing,
    references: [
      'Modern UI products are verified in real browsers across desktop and mobile viewports',
      'Production UI surfaces include accessible labels, responsive layout and explicit loading/error/empty states',
      'Build-only checks cannot prove that a UI is visible, usable or responsive',
    ],
  };
}

function capability(
  id: string,
  label: string,
  met: boolean,
  evidence: string[],
): ProductMaturityAssessment['capabilities'][number] {
  return { id, label, met, evidence: met ? evidence : [], required_for_market_parity: true };
}

function productMaturityLevel(score: number, missingRequiredCapabilities = 0): ProductMaturityAssessment['level'] {
  if (missingRequiredCapabilities > 0 && score >= 90) return 'market_parity_candidate';
  if (score >= 90) return 'market_ready';
  if (score >= 70) return 'market_parity_candidate';
  if (score >= 50) return 'domain_product_candidate';
  if (score >= 30) return 'engineering_baseline';
  return 'demo';
}

function socialDeductionRoleSurfaceScore(blob: string): number {
  const roles = [
    'werewolf',
    'villager',
    'seer',
    'witch',
    'hunter',
    'guard',
    'idiot',
    'sorcerer',
    'wolf seer',
    'blind werewolf',
    'wolf shaman',
    'knight',
    'cupid',
    'thief',
    'elder',
    '白狼王',
    '骑士',
    '混血儿',
    '野孩子',
    '鬼魂新娘',
  ];
  return roles.filter((role) => blob.includes(role.toLowerCase())).length;
}

function flaskStartRouteSection(appPy: string): string {
  const match = /@app\.(?:route|post)\(\s*["']\/start["'][\s\S]*/.exec(appPy);
  if (!match) return '';
  return match[0].split(/\n@app\.(?:route|get|post|put|delete|patch)\(/)[0] ?? match[0];
}

function hasPythonDependencyConstraintPolicy(files: string[]): boolean {
  return files.some((f) => /^(constraints\.txt|requirements\.lock|uv\.lock|poetry\.lock|pdm\.lock|Pipfile\.lock)$/.test(f));
}

function parsePythonDependencySpecs(requirementsText: string, pyprojectText: string): string[] {
  const specs: string[] = [];
  for (const raw of requirementsText.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#') || line.startsWith('-')) continue;
    specs.push(line);
  }
  const depArray = pyprojectText.match(/dependencies\s*=\s*\[([\s\S]*?)\]/m)?.[1] ?? '';
  for (const match of depArray.matchAll(/["']([^"']+)["']/g)) {
    specs.push(match[1]!.trim());
  }
  return Array.from(new Set(specs.filter(Boolean)));
}

function dependencyName(spec: string): string {
  return spec
    .split(/[<>=!~;]/)[0]!
    .trim()
    .replace(/\[.*\]$/, '')
    .toLowerCase();
}

function hasUpperBound(spec: string): boolean {
  return /(^|[, ])(?:==|===|~=|<|<=)\s*[^,\s]+/.test(spec);
}

function constraintTextBoundsDependency(constraintsText: string, spec: string): boolean {
  const name = dependencyName(spec);
  if (!name || !constraintsText.trim()) return false;
  return constraintsText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+#.*$/, '').trim())
    .some((line) => dependencyName(line) === name && hasUpperBound(line));
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
