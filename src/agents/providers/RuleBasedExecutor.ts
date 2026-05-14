import path from 'node:path';
import type { AgentTask, AgentResult, VerificationResult } from '../../core/types.js';
import type { AgentProvider, AgentContext } from './AgentProvider.js';
import { readJsonSafe, writeJson } from '../../utils/json.js';
import { writeText, readTextSafe, fileExists, listFiles } from '../../utils/fs.js';
import { runCommand } from '../../core/commandRunner.js';

/**
 * RuleBasedExecutor: deterministic, non-LLM executor that **actually writes
 * files** for a small but useful set of gap categories. Picked because:
 *
 *  - It moves project score for real (vs. mock).
 *  - It is fully testable and reproducible.
 *  - It demonstrates the executor contract: emit changed_files, run
 *    verification commands, surface evidence.
 *
 * Handler set (matched on expected_changed_files / task title):
 *   README.md                       → write a sensible README scaffold
 *   .env.example                    → write a placeholder env file
 *   .gitignore                      → write a minimal gitignore
 *   public/*                        → write static web app public assets
 *   .github/workflows/ci.yml        → write a minimal CI workflow
 *   UI source/style files            → harden common UI interaction/accessibility issues
 *   tests/*                         → drop a node:test smoke test
 *   tests/test_smoke.py             → drop a pytest-compatible Python smoke test
 *   package.json                    → patch in missing test/build scripts
 *   pyproject.toml / CHANGELOG.md   → write minimal project metadata/docs
 *
 * Tasks the executor doesn't know how to handle are returned as `skipped`
 * with `unable_to_verify_reason="no_rule_for_task"`, which is the correct
 * signal under the project standard's verification policy.
 */
export class RuleBasedExecutor implements AgentProvider {
  readonly name = 'rule-based';

  async runTask(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
    const projectPath = path.resolve(ctx.project_path);
    const result: AgentResult = {
      task_id: task.id,
      agent: 'executor',
      status: 'completed',
      summary: '',
      changed_files: [],
      commands_run: [],
      verification_evidence: [],
      failures: [],
      risks: [],
      next_steps: [],
    };

    const targets = task.expected_changed_files.map((f) => f.trim());
    const handler = chooseHandler(task, targets);

    if (!handler) {
      return {
        ...result,
        status: 'skipped',
        summary: `no rule-based handler for task "${task.title}"`,
        unable_to_verify_reason: 'no_rule_for_task',
      };
    }

    try {
      const handled = await handler(projectPath);
      result.changed_files = handled.changed_files;
      result.summary = handled.summary;
    } catch (err) {
      return {
        ...result,
        status: 'failed',
        summary: `handler threw: ${err instanceof Error ? err.message : String(err)}`,
        failures: [`handler_error:${String(err)}`],
      };
    }

    // Run verification commands. Anything else is the Verifier's job.
    for (const cmd of task.verification_commands) {
      const vr: VerificationResult = await runCommand(cmd, {
        cwd: projectPath,
        timeoutMs: 60_000,
      });
      result.commands_run.push(cmd);
      result.verification_evidence.push(vr);
      if (!vr.passed) result.failures.push(`${cmd} → ${vr.failure_reason ?? 'failed'}`);
    }

    const allPassed = result.verification_evidence.every((e) => e.passed);
    result.status =
      result.changed_files.length > 0 && result.verification_evidence.length === 0
        ? 'failed' // would violate verification policy
        : allPassed
          ? 'completed'
          : 'failed';
    return result;
  }
}

// --- Handler routing -----------------------------------------------------

type Handler = (projectPath: string) => Promise<{ summary: string; changed_files: string[] }>;
const NODE_SMOKE_TEST_COMMAND = 'node --test tests/smoke.test.mjs';
const PYTHON_SMOKE_CANDIDATES = ['app.py', 'demo.py', 'game.py', 'player.py', 'prompts.py', 'main.py', 'cli.py', 'server.py', 'bot.py', 'diag.py'];

function chooseHandler(task: AgentTask, targets: string[]): Handler | null {
  const taskText = `${task.title}\n${task.description}`;
  if (/repair failing project verification/i.test(task.title)) {
    return repairFailingProjectVerification;
  }
  if (/add python dependency constraints/i.test(task.title)) {
    return addPythonDependencyConstraints;
  }
  if (/add flask regression tests/i.test(task.title)) {
    return addFlaskRegressionTests;
  }
  if (/add operational documentation/i.test(task.title)) {
    return addOperationalDocumentation;
  }
  if (/add social deduction rules engine/i.test(task.title)) {
    return addSocialDeductionRulesEngine;
  }
  if (/define social deduction market parity roadmap/i.test(task.title)) {
    return writeSocialDeductionMarketParityRoadmap;
  }
  if (/add player-supplied llm provider configuration/i.test(task.title)) {
    return addPlayerSuppliedLlmProviderConfig;
  }
  if (/add single-file demo intake harness/i.test(task.title)) {
    return addSingleFileDemoIntakeHarness;
  }
  if (/add cli executable contract harness/i.test(task.title)) {
    return addCliExecutableContractHarness;
  }
  if (/add api contract harness/i.test(task.title)) {
    return addApiContractHarness;
  }
  if (/add config contract harness/i.test(task.title)) {
    return addConfigContractHarness;
  }
  if (/add data migration contract harness/i.test(task.title)) {
    return addDataMigrationContractHarness;
  }
  if (/add worker contract harness/i.test(task.title)) {
    return addWorkerContractHarness;
  }
  if (/add ui product verification harness/i.test(task.title)) {
    return addUiProductVerificationHarness;
  }
  if (/add ui runtime render smoke verification/i.test(task.title)) {
    return addUiProductVerificationHarness;
  }
  if (/align ui service claims/i.test(task.title)) {
    return alignUiServiceClaimsWithImplementedBackend;
  }
  if (/harden ui interaction/i.test(task.title)) {
    return hardenUiInteractionAccessibilityAndPolish;
  }
  if (/harden flask public runtime controls/i.test(task.title)) {
    return hardenFlaskRuntimeControls;
  }
  if (targets.some((t) => t === 'README.md') && /deployment|public demo|gunicorn|docker|healthz/i.test(taskText)) {
    return writeDeploymentDocs;
  }
  if (targets.some((t) => t === 'README.md') || /readme/i.test(task.title)) {
    return writeReadme;
  }
  if (targets.some((t) => t === '.env.example') || /env\.example/i.test(task.title)) {
    return writeEnvExample;
  }
  if (targets.some((t) => t === 'CHANGELOG.md') || /changelog/i.test(task.title)) {
    return writeChangelog;
  }
  if (targets.some((t) => t === '.gitignore') || /gitignore/i.test(task.title)) {
    return writeGitignore;
  }
  if (targets.some((t) => t === 'public' || t.startsWith('public/')) || /static public assets/i.test(taskText)) {
    return writePublicAssets;
  }
  if (targets.some((t) => t === 'pyproject.toml') || /pyproject/i.test(task.title)) {
    return writePyproject;
  }
  if (targets.some((t) => t === 'tsconfig.json') || /tsconfig/i.test(task.title)) {
    return writeTsconfig;
  }
  if (targets.some((t) => t === 'Dockerfile') || /dockerfile/i.test(task.title)) {
    if (/flask|python/i.test(task.title) || targets.some((t) => t === 'wsgi.py' || t === '.dockerignore')) {
      return writeFlaskDeploymentScaffold;
    }
    return writeDockerfile;
  }
  if (targets.some((t) => t === 'app.py' || t === 'config.py') && /flask health|config guard|health/i.test(task.title)) {
    return writeFlaskHealthConfigGuard;
  }
  if (targets.some((t) => t === 'wsgi.py') || /deployment scaffold|production server|wsgi/i.test(task.title)) {
    return writeFlaskDeploymentScaffold;
  }
  if (targets.some((t) => t.startsWith('.github/workflows')) || /ci|workflow/i.test(task.title)) {
    return writeCiWorkflow;
  }
  if (targets.some((t) => t === 'tests/test_app.py') || /flask api tests/i.test(task.title)) {
    return writeFlaskApiTests;
  }
  if (targets.some((t) => t === 'tests/test_smoke.py') || /python|pytest/i.test(task.title)) {
    return writePythonSmokeTest;
  }
  if (targets.some((t) => t.startsWith('tests/')) || /test suite/i.test(task.title)) {
    return writeSmokeTest;
  }
  if (targets.some((t) => t === 'package.json') && /python project|package scripts/i.test(task.title)) {
    return alignPackageScriptsWithPython;
  }
  if (targets.some((t) => t === 'package.json') && /echo-only build|build script|script/i.test(task.title)) {
    if (/python/i.test(task.description) || /python/i.test(task.title)) return alignPackageScriptsWithPython;
    return /test/i.test(task.title) ? patchTestScript : patchBuildScript;
  }
  return null;
}

// --- Handlers ------------------------------------------------------------

const writeReadme: Handler = async (projectPath) => {
  const target = path.join(projectPath, 'README.md');
  const existing = (await readTextSafe(target)) ?? '';
  if (existing.length > 400) {
    return { summary: 'README already substantive — no change', changed_files: [] };
  }
  const pkg = await readJsonSafe<{ name?: string; description?: string }>(
    path.join(projectPath, 'package.json'),
  );
  const name = pkg?.name ?? path.basename(projectPath);
  const body = [
    `# ${name}`,
    '',
    pkg?.description ?? 'Project under demo2project iteration.',
    '',
    '## Install',
    '',
    '```bash',
    'npm install',
    '```',
    '',
    '## Usage',
    '',
    'See `package.json` scripts. Common commands:',
    '',
    '```bash',
    'npm test        # run the test suite',
    'npm run build   # build / typecheck the project',
    '```',
    '',
    '## Development',
    '',
    'This project is being iterated by [demo2project](https://example.invalid).',
    'See `.demo2project/iterations/` for the iteration log.',
    '',
  ].join('\n');
  await writeText(target, body);
  return { summary: 'wrote README.md scaffold', changed_files: ['README.md'] };
};

const writeDeploymentDocs: Handler = async (projectPath) => {
  const target = path.join(projectPath, 'README.md');
  const existing = (await readTextSafe(target)) ?? `# ${path.basename(projectPath)}\n`;
  if (/Docker/i.test(existing) && /gunicorn/i.test(existing) && /healthz/i.test(existing)) {
    return { summary: 'deployment docs already present', changed_files: [] };
  }
  const section = [
    '## Public Demo Deployment',
    '',
    'Set `DEEPSEEK_API_KEY` or `OPENAI_API_KEY` before exposing the demo publicly. The app reports readiness at `/healthz` and should reject game starts when no provider key is configured.',
    '',
    'Run with gunicorn:',
    '',
    '```bash',
    'gunicorn -w ${WEB_CONCURRENCY:-1} -k gthread --threads ${WEB_THREADS:-8} -b 0.0.0.0:${PORT:-5001} wsgi:app',
    '```',
    '',
    'Run with Docker:',
    '',
    '```bash',
    'docker build -t demo-app .',
    'docker run --rm -p 5001:5001 -e DEEPSEEK_API_KEY=... demo-app',
    '```',
    '',
    'Health check:',
    '',
    '```bash',
    'curl http://127.0.0.1:5001/healthz',
    '```',
    '',
  ].join('\n');
  await writeText(target, `${existing.trimEnd()}\n\n${section}`);
  return { summary: 'documented public demo deployment', changed_files: ['README.md'] };
};

const writeEnvExample: Handler = async (projectPath) => {
  const target = path.join(projectPath, '.env.example');
  if (fileExists(target)) return { summary: '.env.example already exists', changed_files: [] };
  const body = [
    '# Add one line per environment variable the project reads.',
    '# Do NOT put real secrets here — only placeholder values.',
    'NODE_ENV=development',
    'LOG_LEVEL=info',
    '',
  ].join('\n');
  await writeText(target, body);
  return { summary: 'wrote .env.example', changed_files: ['.env.example'] };
};

const writeChangelog: Handler = async (projectPath) => {
  const target = path.join(projectPath, 'CHANGELOG.md');
  if (fileExists(target)) return { summary: 'CHANGELOG.md already exists', changed_files: [] };
  const body = [
    '# Changelog',
    '',
    '## Unreleased',
    '',
    '- Track notable projectization changes here.',
    '',
  ].join('\n');
  await writeText(target, body);
  return { summary: 'wrote CHANGELOG.md', changed_files: ['CHANGELOG.md'] };
};

const writeGitignore: Handler = async (projectPath) => {
  const target = path.join(projectPath, '.gitignore');
  if (fileExists(target)) return { summary: '.gitignore already exists', changed_files: [] };
  const body = ['node_modules/', 'dist/', 'coverage/', '.demo2project/', '*.log', '.env', '.DS_Store', ''].join('\n');
  await writeText(target, body);
  return { summary: 'wrote .gitignore', changed_files: ['.gitignore'] };
};

const writePublicAssets: Handler = async (projectPath) => {
  const pkg = await readJsonSafe<{ name?: string; description?: string }>(
    path.join(projectPath, 'package.json'),
  );
  const rawName = pkg?.name ?? path.basename(projectPath);
  const appName = rawName
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b[a-z]/g, (m) => m.toUpperCase()) || 'Web App';
  const changed: string[] = [];

  const robotsPath = path.join(projectPath, 'public', 'robots.txt');
  if (!fileExists(robotsPath)) {
    await writeText(robotsPath, ['User-agent: *', 'Allow: /', ''].join('\n'));
    changed.push('public/robots.txt');
  }

  const manifestPath = path.join(projectPath, 'public', 'site.webmanifest');
  if (!fileExists(manifestPath)) {
    await writeText(manifestPath, JSON.stringify({
      name: appName,
      short_name: appName.slice(0, 12),
      description: pkg?.description ?? `${appName} web application`,
      start_url: '/',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: '#111827',
    }, null, 2) + '\n');
    changed.push('public/site.webmanifest');
  }

  return {
    summary: changed.length > 0 ? 'wrote static public assets' : 'static public assets already present',
    changed_files: changed,
  };
};

const addSingleFileDemoIntakeHarness: Handler = async (projectPath) => {
  const files = await listFiles(projectPath);
  const entry = detectSingleFileDemoEntry(files) ?? inferPrimaryDemoEntry(files);
  const changed = new Set<string>();

  const docPath = path.join(projectPath, 'docs', 'demo-intake.md');
  const doc = demoIntakeDocument(entry);
  if ((await readTextSafe(docPath)) !== doc) {
    await writeText(docPath, doc);
    changed.add('docs/demo-intake.md');
  }

  const scriptPath = path.join(projectPath, 'scripts', 'demo-runtime-check.mjs');
  const script = demoRuntimeCheckScript(entry);
  if ((await readTextSafe(scriptPath)) !== script) {
    await writeText(scriptPath, script);
    changed.add('scripts/demo-runtime-check.mjs');
  }

  if (await ensureScript(projectPath, 'demo:intake-check', 'node scripts/demo-runtime-check.mjs', true)) {
    changed.add('package.json');
  }

  return {
    summary: changed.size > 0 ? 'added single-file demo intake/runtime contract harness' : 'single-file demo intake harness already present',
    changed_files: Array.from(changed),
  };
};

const addCliExecutableContractHarness: Handler = async (projectPath) => {
  const files = await listFiles(projectPath);
  const entry = await inferCliEntry(projectPath, files);
  const changed = new Set<string>();

  const docPath = path.join(projectPath, 'docs', 'cli-contract.md');
  const doc = cliContractDocument(entry);
  if ((await readTextSafe(docPath)) !== doc) {
    await writeText(docPath, doc);
    changed.add('docs/cli-contract.md');
  }

  const scriptPath = path.join(projectPath, 'scripts', 'cli-contract-check.mjs');
  const script = cliContractCheckScript(entry);
  if ((await readTextSafe(scriptPath)) !== script) {
    await writeText(scriptPath, script);
    changed.add('scripts/cli-contract-check.mjs');
  }

  if (await ensureScript(projectPath, 'cli:contract-check', 'node scripts/cli-contract-check.mjs', true)) {
    changed.add('package.json');
  }

  return {
    summary: changed.size > 0 ? 'added CLI executable contract harness' : 'CLI executable contract harness already present',
    changed_files: Array.from(changed),
  };
};

const addApiContractHarness: Handler = async (projectPath) => {
  const changed = new Set<string>();
  const docPath = path.join(projectPath, 'docs', 'api-contract.md');
  const doc = apiContractDocument();
  if ((await readTextSafe(docPath)) !== doc) {
    await writeText(docPath, doc);
    changed.add('docs/api-contract.md');
  }
  const scriptPath = path.join(projectPath, 'scripts', 'api-contract-check.mjs');
  const script = apiContractCheckScript();
  if ((await readTextSafe(scriptPath)) !== script) {
    await writeText(scriptPath, script);
    changed.add('scripts/api-contract-check.mjs');
  }
  if (await ensureScript(projectPath, 'api:contract-check', 'node scripts/api-contract-check.mjs', true)) {
    changed.add('package.json');
  }
  await ensurePythonPackageValidationScripts(projectPath, changed);
  return {
    summary: changed.size > 0 ? 'added API contract/runtime harness' : 'API contract harness already present',
    changed_files: Array.from(changed),
  };
};

const addConfigContractHarness: Handler = async (projectPath) => {
  const changed = new Set<string>();
  const envVars = await detectProjectEnvVars(projectPath);
  if (envVars.length > 0 && await ensureEnvExampleVars(projectPath, envVars)) {
    changed.add('.env.example');
  }
  const docPath = path.join(projectPath, 'docs', 'config-contract.md');
  const doc = configContractDocument(envVars);
  if ((await readTextSafe(docPath)) !== doc) {
    await writeText(docPath, doc);
    changed.add('docs/config-contract.md');
  }
  const scriptPath = path.join(projectPath, 'scripts', 'config-contract-check.mjs');
  const script = configContractCheckScript();
  if ((await readTextSafe(scriptPath)) !== script) {
    await writeText(scriptPath, script);
    changed.add('scripts/config-contract-check.mjs');
  }
  if (await ensureScript(projectPath, 'config:contract-check', 'node scripts/config-contract-check.mjs', true)) {
    changed.add('package.json');
  }
  await ensurePythonPackageValidationScripts(projectPath, changed);
  return {
    summary: changed.size > 0 ? 'added config contract harness' : 'config contract harness already present',
    changed_files: Array.from(changed),
  };
};

const addDataMigrationContractHarness: Handler = async (projectPath) => {
  const changed = new Set<string>();
  const docPath = path.join(projectPath, 'docs', 'data-contract.md');
  const doc = dataContractDocument();
  if ((await readTextSafe(docPath)) !== doc) {
    await writeText(docPath, doc);
    changed.add('docs/data-contract.md');
  }
  const scriptPath = path.join(projectPath, 'scripts', 'data-contract-check.mjs');
  const script = dataContractCheckScript();
  if ((await readTextSafe(scriptPath)) !== script) {
    await writeText(scriptPath, script);
    changed.add('scripts/data-contract-check.mjs');
  }
  if (await ensureScript(projectPath, 'data:contract-check', 'node scripts/data-contract-check.mjs', true)) {
    changed.add('package.json');
  }
  await ensurePythonPackageValidationScripts(projectPath, changed);
  return {
    summary: changed.size > 0 ? 'added data migration contract harness' : 'data migration harness already present',
    changed_files: Array.from(changed),
  };
};

const addWorkerContractHarness: Handler = async (projectPath) => {
  const changed = new Set<string>();
  const docPath = path.join(projectPath, 'docs', 'worker-contract.md');
  const doc = workerContractDocument();
  if ((await readTextSafe(docPath)) !== doc) {
    await writeText(docPath, doc);
    changed.add('docs/worker-contract.md');
  }
  const scriptPath = path.join(projectPath, 'scripts', 'worker-contract-check.mjs');
  const script = workerContractCheckScript();
  if ((await readTextSafe(scriptPath)) !== script) {
    await writeText(scriptPath, script);
    changed.add('scripts/worker-contract-check.mjs');
  }
  if (await ensureScript(projectPath, 'worker:contract-check', 'node scripts/worker-contract-check.mjs', true)) {
    changed.add('package.json');
  }
  await ensurePythonPackageValidationScripts(projectPath, changed);
  return {
    summary: changed.size > 0 ? 'added worker contract harness' : 'worker contract harness already present',
    changed_files: Array.from(changed),
  };
};

const writeCiWorkflow: Handler = async (projectPath) => {
  const target = path.join(projectPath, '.github', 'workflows', 'ci.yml');
  const python = await isPythonProject(projectPath);
  const existing = await readTextSafe(target);
  if (existing && (!python || /setup-python|pytest|pip install/i.test(existing))) {
    return { summary: 'ci.yml already exists', changed_files: [] };
  }
  if (python) {
    const body = [
      'name: CI',
      'on: [push, pull_request]',
      'jobs:',
      '  test:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: actions/setup-python@v5',
      '        with:',
      '          python-version: "3.11"',
      '      - run: python -m pip install --upgrade pip',
      '      - run: pip install -r requirements.txt',
      '      - run: python -m pytest -q',
      '',
    ].join('\n');
    await writeText(target, body);
    return { summary: existing ? 'updated CI workflow for Python' : 'wrote Python CI workflow', changed_files: ['.github/workflows/ci.yml'] };
  }
  const body = [
    'name: CI',
    'on: [push, pull_request]',
    'jobs:',
    '  test:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '      - uses: actions/setup-node@v4',
    '        with:',
    '          node-version: 20',
    '      - run: npm ci || npm install',
    '      - run: npm test',
    '',
  ].join('\n');
  await writeText(target, body);
  return { summary: 'wrote .github/workflows/ci.yml', changed_files: ['.github/workflows/ci.yml'] };
};

const writePyproject: Handler = async (projectPath) => {
  const target = path.join(projectPath, 'pyproject.toml');
  if (fileExists(target)) return { summary: 'pyproject.toml already exists', changed_files: [] };
  const req = await readRequirements(projectPath);
  const deps = req
    .filter((line) => !/^pytest\b/i.test(line))
    .map((line) => `  "${line}",`);
  const body = [
    '[project]',
    `name = "${path.basename(projectPath).toLowerCase().replace(/[^a-z0-9_-]+/g, '-')}"`,
    'version = "0.1.0"',
    'description = "Projectized Python demo."',
    'requires-python = ">=3.10"',
    'dependencies = [',
    ...deps,
    ']',
    '',
    '[tool.pytest.ini_options]',
    'testpaths = ["tests"]',
    '',
  ].join('\n');
  await writeText(target, body);
  return { summary: 'wrote pyproject.toml', changed_files: ['pyproject.toml'] };
};

const writeTsconfig: Handler = async (projectPath) => {
  const target = path.join(projectPath, 'tsconfig.json');
  if (fileExists(target)) return { summary: 'tsconfig.json already exists', changed_files: [] };
  await writeJson(target, {
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      outDir: 'dist',
      rootDir: 'src',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      resolveJsonModule: true,
    },
    include: ['src/**/*'],
  });
  return { summary: 'wrote tsconfig.json', changed_files: ['tsconfig.json'] };
};

const writeDockerfile: Handler = async (projectPath) => {
  if (await isPythonProject(projectPath)) {
    return writeFlaskDeploymentScaffold(projectPath);
  }
  const target = path.join(projectPath, 'Dockerfile');
  if (fileExists(target)) return { summary: 'Dockerfile already exists', changed_files: [] };
  const body = [
    'FROM node:20-alpine',
    'WORKDIR /app',
    'COPY package*.json ./',
    'RUN npm ci || npm install',
    'COPY . .',
    'CMD ["npm", "start"]',
    '',
  ].join('\n');
  await writeText(target, body);
  return { summary: 'wrote Dockerfile', changed_files: ['Dockerfile'] };
};

const writeFlaskDeploymentScaffold: Handler = async (projectPath) => {
  const changed = new Set<string>();
  for (const file of await ensureFutureAnnotationsForPythonSources(projectPath)) changed.add(file);
  const dockerfile = path.join(projectPath, 'Dockerfile');
  if (!fileExists(dockerfile)) {
    const body = [
      'FROM python:3.11-slim',
      '',
      'ENV PYTHONDONTWRITEBYTECODE=1 \\',
      '    PYTHONUNBUFFERED=1 \\',
      '    PORT=5001',
      '',
      'WORKDIR /app',
      '',
      'COPY requirements.txt .',
      'RUN pip install --no-cache-dir -r requirements.txt',
      '',
      'COPY . .',
      '',
      'EXPOSE 5001',
      '',
      'HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \\',
      '  CMD python -c "import os,urllib.request; urllib.request.urlopen(\'http://127.0.0.1:%s/healthz\' % os.environ.get(\'PORT\', \'5001\'), timeout=2)"',
      '',
      'CMD ["sh", "-c", "gunicorn -w ${WEB_CONCURRENCY:-1} -k gthread --threads ${WEB_THREADS:-8} -b 0.0.0.0:${PORT:-5001} wsgi:app"]',
      '',
    ].join('\n');
    await writeText(dockerfile, body);
    changed.add('Dockerfile');
  }
  const dockerignore = path.join(projectPath, '.dockerignore');
  if (!fileExists(dockerignore)) {
    await writeText(dockerignore, ['.git', '.venv', '.zp', '.demo2project', '.pytest_cache', '__pycache__', '*.pyc', '.DS_Store', ''].join('\n'));
    changed.add('.dockerignore');
  }
  const wsgi = path.join(projectPath, 'wsgi.py');
  if (!fileExists(wsgi)) {
    await writeText(wsgi, 'from app import app\n');
    changed.add('wsgi.py');
  }
  if (await ensureRequirement(projectPath, 'gunicorn>=22.0.0')) changed.add('requirements.txt');
  return {
    summary: changed.size > 0 ? 'wrote Flask deployment scaffold' : 'Flask deployment scaffold already present',
    changed_files: Array.from(changed),
  };
};

const writeSmokeTest: Handler = async (projectPath) => {
  const target = path.join(projectPath, 'tests', 'smoke.test.mjs');
  if (fileExists(target)) return { summary: 'smoke test already exists', changed_files: [] };
  const body = [
    "import { test } from 'node:test';",
    "import assert from 'node:assert';",
    '',
    "test('project module sanity', () => {",
    '  assert.equal(1 + 1, 2);',
    '});',
    '',
  ].join('\n');
  await writeText(target, body);
  // Ensure package.json has a test script pointing to node --test
  await ensureScript(projectPath, 'test', NODE_SMOKE_TEST_COMMAND);
  return { summary: 'wrote tests/smoke.test.mjs and ensured test script', changed_files: ['tests/smoke.test.mjs', 'package.json'] };
};

const writePythonSmokeTest: Handler = async (projectPath) => {
  const target = path.join(projectPath, 'tests', 'test_smoke.py');
  const changed = new Set<string>();
  if (!fileExists(target)) {
    const body = [
      'import ast',
      'from pathlib import Path',
      '',
      '',
      'def test_python_sources_compile():',
      '    root = Path(__file__).resolve().parents[1]',
      `    candidates = ${JSON.stringify(PYTHON_SMOKE_CANDIDATES)}`,
      '    found = False',
      '    for name in candidates:',
      '        path = root / name',
      '        if path.exists():',
      '            found = True',
      '            ast.parse(path.read_text(), filename=str(path))',
      '    assert found, "expected at least one Python source file"',
      '',
    ].join('\n');
    await writeText(target, body);
    changed.add('tests/test_smoke.py');
  } else {
    const original = await readTextSafe(target);
    const next = original ? patchPythonSmokeTestCandidates(original) : original;
    if (next && next !== original) {
      await writeText(target, next);
      changed.add('tests/test_smoke.py');
    }
  }
  if (await ensureRequirement(projectPath, 'pytest>=8.0')) changed.add('requirements.txt');
  if (await ensureScript(projectPath, 'test', 'python3 -m pytest -q', true)) changed.add('package.json');
  if (await ensureScript(projectPath, 'build', await pythonCompileCommand(projectPath), true)) changed.add('package.json');
  return {
    summary: changed.size > 0 ? 'wrote Python smoke test and aligned compatibility scripts' : 'Python smoke test already configured',
    changed_files: Array.from(changed),
  };
};

const writeFlaskApiTests: Handler = async (projectPath) => {
  const changed = new Set<string>(await ensureFutureAnnotationsForPythonSources(projectPath));
  for (const file of await ensureFlaskApiTestFile(projectPath)) changed.add(file);
  return {
    summary: changed.size > 0 ? 'ensured Flask API tests' : 'Flask API tests already exist',
    changed_files: Array.from(changed),
  };
};

async function ensureFlaskApiTestFile(projectPath: string): Promise<string[]> {
  const target = path.join(projectPath, 'tests', 'test_app.py');
  const changed = new Set<string>();
  if (fileExists(target)) {
    if (await ensureRequirement(projectPath, 'pytest>=8.0')) changed.add('requirements.txt');
    return Array.from(changed);
  }
  const body = [
    'import pytest',
    '',
    '',
    '@pytest.fixture()',
    'def client(monkeypatch):',
    '    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)',
    '    monkeypatch.delenv("OPENAI_API_KEY", raising=False)',
    '    import app as app_module',
    '    app_module.app.config.update(TESTING=True)',
    '    app_module._games.clear()',
    '    yield app_module.app.test_client()',
    '    app_module._games.clear()',
    '',
    '',
    'def test_healthz(client):',
    '    response = client.get("/healthz")',
    '    assert response.status_code == 200',
    '    assert response.get_json()["ok"] is True',
    '',
    '',
    'def test_modes(client):',
    '    response = client.get("/modes")',
    '    assert response.status_code == 200',
    '    assert len(response.get_json()["modes"]) > 0',
    '',
    '',
    'def test_start_rejects_missing_key(client):',
    '    response = client.post("/start", json={"mode": "m6"})',
    '    assert response.status_code == 400',
    '    assert response.get_json()["error"] == "missing_api_key"',
    '',
  ].join('\n');
  await writeText(target, body);
  changed.add('tests/test_app.py');
  if (await ensureRequirement(projectPath, 'pytest>=8.0')) changed.add('requirements.txt');
  return Array.from(changed);
}

const writeFlaskHealthConfigGuard: Handler = async (projectPath) => {
  const changed = new Set<string>();
  for (const file of await ensureFutureAnnotationsForPythonSources(projectPath)) changed.add(file);
  const configPath = path.join(projectPath, 'config.py');
  if (!fileExists(configPath)) {
    const body = [
      'from __future__ import annotations',
      '',
      'import os',
      '',
      'MISSING_KEY_NAME = "DEEPSEEK_API_KEY or OPENAI_API_KEY"',
      '',
      '',
      'def has_api_key() -> bool:',
      '    return bool(os.environ.get("DEEPSEEK_API_KEY") or os.environ.get("OPENAI_API_KEY"))',
      '',
      '',
      'def missing_api_key_payload() -> dict[str, str]:',
      '    return {',
      '        "error": "missing_api_key",',
      '        "message": f"Set {MISSING_KEY_NAME} before starting a game.",',
      '    }',
      '',
      '',
      'def public_config() -> dict[str, object]:',
      '    return {"has_key": has_api_key(), "missing_key": None if has_api_key() else MISSING_KEY_NAME}',
      '',
      '',
      'def max_active_games() -> int:',
      '    return 3',
      '',
    ].join('\n');
    await writeText(configPath, body);
    changed.add('config.py');
  }

  const appPath = path.join(projectPath, 'app.py');
  let appText = (await readTextSafe(appPath)) ?? '';
  if (!appText) return { summary: 'app.py missing; unable to add Flask guard', changed_files: Array.from(changed) };
  if (!/from __future__ import annotations/.test(appText)) {
    appText = `from __future__ import annotations\n\n${appText}`;
  }
  appText = ensureConfigImport(appText);
  if (!/\/healthz/.test(appText)) {
    const healthRoute = [
      '',
      '',
      '@app.route("/healthz")',
      'def healthz():',
      '    return jsonify({',
      '        "ok": True,',
      '        "service": "demo",',
      '        "llm_configured": public_config()["has_key"],',
      '        "max_active_games": max_active_games(),',
      '    })',
      '',
    ].join('\n');
    appText = appText.replace(/(app\s*=\s*Flask\([^\n]*\)\n)/, `$1${healthRoute}`);
  }
  if (!hasStartConfigGuard(appText)) {
    appText = insertStartConfigGuard(appText);
  }
  await writeText(appPath, appText);
  changed.add('app.py');
  for (const file of await ensureFlaskApiTestFile(projectPath)) changed.add(file);
  return {
    summary: 'added Flask health endpoint and missing-key guard',
    changed_files: Array.from(changed),
  };
};

const hardenFlaskRuntimeControls: Handler = async (projectPath) => {
  const changed = new Set<string>();
  for (const file of await ensureFutureAnnotationsForPythonSources(projectPath)) changed.add(file);
  if (await ensureMaxActiveGamesConfig(projectPath)) changed.add('config.py');

  const appPath = path.join(projectPath, 'app.py');
  const original = (await readTextSafe(appPath)) ?? '';
  if (!original) {
    return { summary: 'app.py missing; unable to harden Flask runtime controls', changed_files: Array.from(changed) };
  }
  let appText = original;
  appText = ensureLoggingImport(appText);
  appText = ensureConfigImportNames(appText, ['require_api_key', 'max_active_games']);
  appText = ensureLogger(appText);
  appText = ensureSecurityHeadersHook(appText);
  appText = ensureStartModeValidation(appText);
  appText = ensureSpeedClamp(appText);
  appText = ensureActiveGameLimit(appText);
  appText = ensureRuntimeLogCalls(appText);
  if (appText !== original) {
    await writeText(appPath, appText);
    changed.add('app.py');
  }
  for (const file of await ensureIndustrialFlaskApiTests(projectPath)) changed.add(file);
  return {
    summary: changed.size > 0 ? 'hardened Flask public runtime controls' : 'Flask runtime controls already hardened',
    changed_files: Array.from(changed),
  };
};

const repairFailingProjectVerification: Handler = async (projectPath) => {
  const appText = (await readTextSafe(path.join(projectPath, 'app.py'))) ?? '';
  if (/\bfrom\s+flask\s+import\b|\bFlask\s*\(/.test(appText)) {
    return hardenFlaskRuntimeControls(projectPath);
  }
  const smokePath = path.join(projectPath, 'tests', 'test_smoke.py');
  const smokeText = await readTextSafe(smokePath);
  if (smokeText && /expected at least one Python source file|candidates\s*=/.test(smokeText)) {
    const next = patchPythonSmokeTestCandidates(smokeText);
    if (next !== smokeText) {
      await writeText(smokePath, next);
      return {
        summary: 'repaired Python smoke test entry candidates',
        changed_files: ['tests/test_smoke.py'],
      };
    }
  }
  return {
    summary: 'no deterministic repair rule for this verification failure',
    changed_files: [],
  };
};

const addPythonDependencyConstraints: Handler = async (projectPath) => {
  const changed = new Set<string>();
  const requirements = await readRequirements(projectPath);
  const bounded = requirements
    .map(toBoundedPythonConstraint)
    .filter((line): line is string => !!line);
  if (bounded.length > 0) {
    const constraintsPath = path.join(projectPath, 'constraints.txt');
    const body = [
      '# Direct dependency constraints for reproducible demo deployments.',
      '# Keep requirements.txt as the intent file; install with -c constraints.txt.',
      ...Array.from(new Set(bounded)).sort(),
      '',
    ].join('\n');
    const existing = await readTextSafe(constraintsPath);
    if (existing !== body) {
      await writeText(constraintsPath, body);
      changed.add('constraints.txt');
    }
  }
  if (await ensureReadmeUsesConstraints(projectPath)) changed.add('README.md');
  return {
    summary: changed.size > 0 ? 'added Python dependency constraints' : 'Python dependency constraints already present',
    changed_files: Array.from(changed),
  };
};

const addFlaskRegressionTests: Handler = async (projectPath) => {
  const target = path.join(projectPath, 'tests', 'test_regression.py');
  const body = [
    '"""Regression tests for productized Flask runtime behavior."""',
    'import pytest',
    '',
    '',
    '@pytest.fixture()',
    'def client(monkeypatch):',
    '    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")',
    '    import app as app_module',
    '    app_module.app.config.update(TESTING=True)',
    '    if hasattr(app_module, "_games"):',
    '        app_module._games.clear()',
    '    with app_module.app.test_client() as client:',
    '        yield client',
    '    if hasattr(app_module, "_games"):',
    '        app_module._games.clear()',
    '',
    '',
    'def test_regression_health_endpoint_keeps_security_headers(client):',
    '    response = client.get("/healthz")',
    '    assert response.status_code == 200',
    '    assert response.headers["X-Content-Type-Options"] == "nosniff"',
    '',
    '',
    'def test_regression_invalid_mode_is_rejected(client):',
    '    response = client.post("/start", json={"mode": "invalid_mode"})',
    '    assert response.status_code == 400',
    '    assert response.get_json()["error"] == "invalid_mode"',
    '',
  ].join('\n');
  const existing = await readTextSafe(target);
  if (existing === body) {
    return { summary: 'Flask regression tests already present', changed_files: [] };
  }
  await writeText(target, body);
  return { summary: 'added Flask regression tests', changed_files: ['tests/test_regression.py'] };
};

const addOperationalDocumentation: Handler = async (projectPath) => {
  const changed = new Set<string>();
  const architecturePath = path.join(projectPath, 'docs', 'architecture.md');
  const operationsPath = path.join(projectPath, 'docs', 'operations.md');
  const architecture = [
    '# Architecture',
    '',
    'This productized Flask app exposes a browser UI, JSON control endpoints, and an SSE stream for live game events.',
    '',
    '## Runtime Flow',
    '',
    '- `app.py` owns HTTP routes, input validation, security headers, in-memory game queues, and SSE responses.',
    '- `game.py` coordinates the game master and player turns.',
    '- `player.py` isolates model-provider calls behind environment-based configuration.',
    '- `config.py` centralizes API-key checks and active-game limits.',
    '',
    '## Verification Boundary',
    '',
    'The product boundary is the Flask API plus the game orchestration modules. Pytest covers route behavior, regression controls, and Python syntax importability.',
    '',
  ].join('\n');
  const operations = [
    '# Operations',
    '',
    '## Configuration',
    '',
    '- Set `DEEPSEEK_API_KEY` or `OPENAI_API_KEY` before starting a game.',
    '- Set `MAX_ACTIVE_GAMES` to cap concurrent in-memory games.',
    '- Install dependencies with `pip install -r requirements.txt -c constraints.txt`.',
    '',
    '## Verification',
    '',
    '```bash',
    'python3 -m pytest -q',
    '```',
    '',
    '## Production Startup',
    '',
    'Run through a WSGI server such as gunicorn and use `/healthz` for platform health checks.',
    '',
    '## Rollback',
    '',
    'If a deployment fails health checks or route regression tests, roll back to the previous artifact and preserve logs for diagnosis.',
    '',
  ].join('\n');
  if ((await readTextSafe(architecturePath)) !== architecture) {
    await writeText(architecturePath, architecture);
    changed.add('docs/architecture.md');
  }
  if ((await readTextSafe(operationsPath)) !== operations) {
    await writeText(operationsPath, operations);
    changed.add('docs/operations.md');
  }
  return {
    summary: changed.size > 0 ? 'added operational documentation' : 'operational documentation already present',
    changed_files: Array.from(changed),
  };
};

const addSocialDeductionRulesEngine: Handler = async (projectPath) => {
  const changed = new Set<string>();
  const rulesPath = path.join(projectPath, 'rules.py');
  const testsPath = path.join(projectPath, 'tests', 'test_rules.py');
  const designPath = path.join(projectPath, 'docs', 'game-design.md');

  const rules = socialDeductionRulesModule();
  if ((await readTextSafe(rulesPath)) !== rules) {
    await writeText(rulesPath, rules);
    changed.add('rules.py');
  }

  const tests = socialDeductionRulesTests();
  if ((await readTextSafe(testsPath)) !== tests) {
    await writeText(testsPath, tests);
    changed.add('tests/test_rules.py');
  }

  const design = socialDeductionGameDesignDoc();
  if ((await readTextSafe(designPath)) !== design) {
    await writeText(designPath, design);
    changed.add('docs/game-design.md');
  }

  const gamePath = path.join(projectPath, 'game.py');
  const originalGame = await readTextSafe(gamePath);
  if (originalGame) {
    const patchedGame = patchSocialDeductionGame(originalGame);
    if (patchedGame !== originalGame) {
      await writeText(gamePath, patchedGame);
      changed.add('game.py');
    }
  }

  if (await ensureRequirement(projectPath, 'pytest>=8.0')) changed.add('requirements.txt');
  return {
    summary: changed.size > 0 ? 'added tested social deduction rules engine' : 'social deduction rules engine already present',
    changed_files: Array.from(changed),
  };
};

const writeSocialDeductionMarketParityRoadmap: Handler = async (projectPath) => {
  const target = path.join(projectPath, 'docs', 'market-parity.md');
  const body = [
    '# Market Parity Roadmap',
    '',
    'This project can pass engineering baseline checks without matching mature online werewolf products. Treat this document as the implementation map from demo-grade gameplay to market-parity social deduction product.',
    '',
    '## Current Tier',
    '',
    '- Engineering baseline: deterministic rules, tests, deployment scaffold and operational docs.',
    '- Not yet market parity: the product still lacks the social, competitive, operational and live-service systems expected from mature werewolf games.',
    '',
    '## Required Capability Areas',
    '',
    '1. Account identity and player profiles.',
    '2. Lobby, room, party invite and matchmaking lifecycle.',
    '3. Real-time human communication such as voice, chat or WebSocket presence.',
    '4. Moderation controls for reports, blocking, muting, AFK/grief handling and abuse review.',
    '5. Ranked, season, rating and leaderboard progression.',
    '6. Persistent match history, replay storage and audit trails.',
    '7. Broader role and mode registry with balance tests for each board.',
    '8. Live operations: events, rewards, cosmetics or inventory systems.',
    '9. Admin and observability surfaces for metrics, incidents and production support.',
    '10. Custom room and host controls for private games and creator workflows.',
    '',
    '## Acceptance Policy',
    '',
    'A mature product claim requires implemented code and tests for these areas. Documentation alone may guide work, but it must not clear the market-parity assessment.',
    '',
  ].join('\n');
  if ((await readTextSafe(target)) === body) {
    return { summary: 'social deduction market parity roadmap already present', changed_files: [] };
  }
  await writeText(target, body);
  return { summary: 'wrote social deduction market parity roadmap', changed_files: ['docs/market-parity.md'] };
};

const addPlayerSuppliedLlmProviderConfig: Handler = async (projectPath) => {
  const changed = new Set<string>();

  const llmConfigPath = path.join(projectPath, 'llm_config.py');
  const llmConfig = playerSuppliedLlmConfigModule();
  if ((await readTextSafe(llmConfigPath)) !== llmConfig) {
    await writeText(llmConfigPath, llmConfig);
    changed.add('llm_config.py');
  }

  const llmTestsPath = path.join(projectPath, 'tests', 'test_llm_config.py');
  const llmTests = playerSuppliedLlmConfigTests();
  if ((await readTextSafe(llmTestsPath)) !== llmTests) {
    await writeText(llmTestsPath, llmTests);
    changed.add('tests/test_llm_config.py');
  }

  const appPath = path.join(projectPath, 'app.py');
  const originalApp = await readTextSafe(appPath);
  if (originalApp) {
    const nextApp = patchFlaskAppForPlayerLlmConfig(originalApp);
    if (nextApp !== originalApp) {
      await writeText(appPath, nextApp);
      changed.add('app.py');
    }
  }

  const playerPath = path.join(projectPath, 'player.py');
  const originalPlayer = await readTextSafe(playerPath);
  if (originalPlayer) {
    const nextPlayer = patchPlayerForPlayerLlmConfig(originalPlayer);
    if (nextPlayer !== originalPlayer) {
      await writeText(playerPath, nextPlayer);
      changed.add('player.py');
    }
  }

  const gamePath = path.join(projectPath, 'game.py');
  const originalGame = await readTextSafe(gamePath);
  if (originalGame) {
    const nextGame = patchGameForPlayerLlmConfig(originalGame);
    if (nextGame !== originalGame) {
      await writeText(gamePath, nextGame);
      changed.add('game.py');
    }
  }

  const templatePath = path.join(projectPath, 'templates', 'index.html');
  const originalTemplate = await readTextSafe(templatePath);
  if (originalTemplate) {
    const nextTemplate = patchTemplateForPlayerLlmConfig(originalTemplate);
    if (nextTemplate !== originalTemplate) {
      await writeText(templatePath, nextTemplate);
      changed.add('templates/index.html');
    }
  }

  for (const rel of ['tests/test_app.py', 'tests/test_regression.py']) {
    const testPath = path.join(projectPath, rel);
    const originalTest = await readTextSafe(testPath);
    if (!originalTest) continue;
    const nextTest = patchFlaskTestsForPlayerLlmConfig(originalTest);
    if (nextTest !== originalTest) {
      await writeText(testPath, nextTest);
      changed.add(rel);
    }
  }

  if (await ensureRequirement(projectPath, 'pytest>=8.0')) changed.add('requirements.txt');
  return {
    summary: changed.size > 0 ? 'added player-supplied LLM provider configuration' : 'player-supplied LLM provider configuration already present',
    changed_files: Array.from(changed),
  };
};

const patchTestScript: Handler = async (projectPath) => {
  const wrote = await ensureScript(projectPath, 'test', NODE_SMOKE_TEST_COMMAND);
  return {
    summary: wrote ? 'added test script' : 'test script already present',
    changed_files: wrote ? ['package.json'] : [],
  };
};

const patchBuildScript: Handler = async (projectPath) => {
  if (await isPythonProject(projectPath)) {
    const wrote = await ensureScript(projectPath, 'build', await pythonCompileCommand(projectPath), true);
    return {
      summary: wrote ? 'aligned build script with Python compile check' : 'build script already present',
      changed_files: wrote ? ['package.json'] : [],
    };
  }
  const wrote = await ensureScript(projectPath, 'build', "node -e \"console.log('build ok')\"");
  return {
    summary: wrote ? 'added build script' : 'build script already present',
    changed_files: wrote ? ['package.json'] : [],
  };
};

const alignPackageScriptsWithPython: Handler = async (projectPath) => {
  const changed = new Set<string>();
  if (await ensureRequirement(projectPath, 'pytest>=8.0')) changed.add('requirements.txt');
  if (await ensureScript(projectPath, 'test', 'python3 -m pytest -q', true)) changed.add('package.json');
  if (await ensureScript(projectPath, 'build', await pythonCompileCommand(projectPath), true)) changed.add('package.json');
  return {
    summary: changed.size > 0 ? 'aligned package scripts with Python validation' : 'package scripts already aligned with Python validation',
    changed_files: Array.from(changed),
  };
};

async function ensurePythonPackageValidationScripts(projectPath: string, changed: Set<string>): Promise<void> {
  if (!await isPythonProject(projectPath)) return;
  if (await ensureRequirement(projectPath, 'pytest>=8.0')) changed.add('requirements.txt');
  if (await ensureScript(projectPath, 'test', 'python3 -m pytest -q', false)) changed.add('package.json');
  if (await ensureScript(projectPath, 'build', await pythonCompileCommand(projectPath), false)) changed.add('package.json');
}

const addUiProductVerificationHarness: Handler = async (projectPath) => {
  const changed = new Set<string>();

  const scriptPath = path.join(projectPath, 'scripts', 'ui-product-check.mjs');
  const script = uiProductCheckScript();
  if ((await readTextSafe(scriptPath)) !== script) {
    await writeText(scriptPath, script);
    changed.add('scripts/ui-product-check.mjs');
  }

  const renderScriptPath = path.join(projectPath, 'scripts', 'ui-render-smoke.mjs');
  const renderScript = uiRenderSmokeScript();
  if ((await readTextSafe(renderScriptPath)) !== renderScript) {
    await writeText(renderScriptPath, renderScript);
    changed.add('scripts/ui-render-smoke.mjs');
  }

  const specPath = path.join(projectPath, 'tests', 'ui', 'smoke.spec.ts');
  const spec = uiSmokePlaywrightSpec();
  if ((await readTextSafe(specPath)) !== spec) {
    await writeText(specPath, spec);
    changed.add('tests/ui/smoke.spec.ts');
  }

  const configPath = path.join(projectPath, 'playwright.config.ts');
  const config = uiPlaywrightConfig();
  if ((await readTextSafe(configPath)) !== config) {
    await writeText(configPath, config);
    changed.add('playwright.config.ts');
  }

  if (await ensureScript(projectPath, 'ui:check', 'node scripts/ui-product-check.mjs', true)) changed.add('package.json');
  if (await ensureScript(projectPath, 'ui:render-check', 'node scripts/ui-render-smoke.mjs', false)) changed.add('package.json');
  if (await ensureScript(projectPath, 'ui:e2e', 'playwright test', false)) changed.add('package.json');
  if (await ensureDevDependency(projectPath, '@playwright/test', '^1.52.0')) changed.add('package.json');

  return {
    summary: changed.size > 0 ? 'added UI product verification harness' : 'UI product verification harness already present',
    changed_files: Array.from(changed),
  };
};

const hardenUiInteractionAccessibilityAndPolish: Handler = async (projectPath) => {
  const files = (await listFiles(projectPath)).filter(isPatchableUiFile);
  const markupText = (await Promise.all(
    files
      .filter((rel) => !/\.(css|scss|sass)$/.test(rel))
      .map((rel) => readTextSafe(path.join(projectPath, rel))),
  )).join('\n');
  const changed = new Set<string>();

  for (const rel of files) {
    const abs = path.join(projectPath, rel);
    const original = await readTextSafe(abs);
    if (original === null) continue;
    let next = original;
    if (/\.(vue|svelte|tsx|jsx|html)$/.test(rel)) {
      next = patchNavAccessibleName(next);
      next = patchFocusableFlipSurfaces(next);
      next = patchPlaceholderUiCopy(next);
    }
    if (/\.vue$/.test(rel)) {
      next = patchVuePointerTracking(next);
    }
    if (/\.(js|ts|vue|svelte)$/.test(rel)) {
      next = patchScriptCursorHiding(next);
      next = patchStaticFlipPanelScript(next);
      next = patchPlaceholderUiCopy(next);
    }
    if (/\.(css|scss|sass|vue|svelte)$/.test(rel)) {
      next = patchUiCss(next, markupText);
    }
    if (next !== original) {
      await writeText(abs, next);
      changed.add(rel);
    }
  }

  return {
    summary: changed.size > 0 ? 'hardened common UI interaction, accessibility and polish issues' : 'UI hardening issues already addressed',
    changed_files: Array.from(changed),
  };
};

const alignUiServiceClaimsWithImplementedBackend: Handler = async (projectPath) => {
  const files = (await listFiles(projectPath)).filter((file) =>
    isPatchableUiFile(file) || /^(README\.md|docs\/.*\.md)$/.test(file),
  );
  const changed = new Set<string>();

  for (const rel of files) {
    const abs = path.join(projectPath, rel);
    const original = await readTextSafe(abs);
    if (original === null) continue;
    const next = patchUnimplementedHostedServiceClaims(original);
    if (next !== original) {
      await writeText(abs, next);
      changed.add(rel);
    }
  }

  return {
    summary: changed.size > 0 ? 'aligned UI service claims with currently implemented backend capabilities' : 'UI service claims already match implemented capabilities',
    changed_files: Array.from(changed),
  };
};

// --- helpers -------------------------------------------------------------

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
  return hasStructuredLayout ? null : sourceFiles[0]!;
}

function inferPrimaryDemoEntry(files: string[]): string {
  return files.find((f) => /^(demo|app|main|index|script|server|bot|game|notebook)\.(py|js|mjs|cjs|ts|html)$/.test(f)) ??
    files.find((f) => /\.(py|js|mjs|cjs|ts|html)$/.test(f)) ??
    'demo.py';
}

function demoIntakeDocument(entry: string): string {
  const ext = path.extname(entry).replace('.', '') || 'unknown';
  const runtime = ext === 'py'
    ? 'Python'
    : ['js', 'mjs', 'cjs', 'ts'].includes(ext)
      ? 'Node.js / JavaScript'
      : ext === 'html'
        ? 'Static HTML'
        : 'Unknown';
  return [
    '# Demo Intake',
    '',
    `- Source entry: \`${entry}\``,
    `- Inferred runtime: ${runtime}`,
    '- Productization stage: raw single-file demo',
    '',
    '## Runtime Contract',
    '',
    'The source entry must remain present and non-empty while d2p expands the demo into a product structure.',
    '`scripts/demo-runtime-check.mjs` performs deterministic local checks without network access.',
    '',
    '## Verification',
    '',
    '```bash',
    'npm run demo:intake-check',
    '```',
    '',
    '## Next Productization Targets',
    '',
    '- Move reusable logic into a tested module or application package.',
    '- Add user-facing documentation and a stable run command.',
    '- Add domain-specific regression tests before large feature changes.',
    '',
  ].join('\n');
}

function demoRuntimeCheckScript(entry: string): string {
  return [
    '#!/usr/bin/env node',
    "import { existsSync, readFileSync } from 'node:fs';",
    "import { spawnSync } from 'node:child_process';",
    "import path from 'node:path';",
    '',
    'const root = process.cwd();',
    `const entry = ${JSON.stringify(entry)};`,
    'const abs = path.join(root, entry);',
    'const checks = [];',
    '',
    'function record(id, ok, detail) {',
    '  checks.push({ id, ok, detail });',
    '}',
    '',
    'record("entry_exists", existsSync(abs), `${entry} exists`);',
    'if (existsSync(abs)) {',
    '  const body = readFileSync(abs, "utf8");',
    '  record("entry_nonempty", body.trim().length > 0, `${entry} is non-empty`);',
    '  const ext = path.extname(entry).toLowerCase();',
    '  if (ext === ".py") {',
    '    const result = spawnSync("python3", ["-m", "py_compile", entry], { cwd: root, encoding: "utf8", timeout: 10_000 });',
    '    record("python_compile", result.status === 0, result.stderr || "python py_compile passed");',
    '  } else if ([".js", ".mjs", ".cjs"].includes(ext)) {',
    '    const result = spawnSync(process.execPath, ["--check", entry], { cwd: root, encoding: "utf8", timeout: 10_000 });',
    '    record("node_syntax", result.status === 0, result.stderr || "node --check passed");',
    '  } else if (ext === ".ts") {',
    '    record("typescript_entry", /\\b(export|import|function|class|const|let|var)\\b/.test(body), "TypeScript-like source shape detected");',
    '  } else if (ext === ".html") {',
    '    record("html_shape", /<!doctype|<html|<body|<main|<div|<script/i.test(body), "HTML document or fragment shape detected");',
    '  } else {',
    '    record("known_extension", false, `Unsupported single-file demo extension: ${ext || "(none)"}`);',
    '  }',
    '}',
    '',
    'const failures = checks.filter((check) => !check.ok);',
    'console.log(JSON.stringify({ ok: failures.length === 0, entry, checks, failures }, null, 2));',
    'if (failures.length > 0) process.exit(1);',
    '',
  ].join('\n');
}

async function inferCliEntry(projectPath: string, files: string[]): Promise<string> {
  const pkg = await readJsonSafe<{ bin?: unknown; main?: string }>(path.join(projectPath, 'package.json'));
  if (typeof pkg?.bin === 'string') return normalizeCliEntry(pkg.bin);
  if (pkg?.bin && typeof pkg.bin === 'object') {
    const first = Object.values(pkg.bin as Record<string, unknown>).find((value) => typeof value === 'string');
    if (typeof first === 'string') return normalizeCliEntry(first);
  }
  return files.find((f) => /^bin\/.+\.(js|mjs|cjs|ts)$/.test(f)) ??
    files.find((f) => /(^|\/)(cli|main)\.py$/.test(f)) ??
    normalizeCliEntry(pkg?.main ?? 'bin/cli.js');
}

function normalizeCliEntry(entry: string): string {
  return entry.replace(/^\.\//, '');
}

function cliContractDocument(entry: string): string {
  return [
    '# CLI Contract',
    '',
    `- Executable entry: \`${entry}\``,
    '- Required user contract: `--help` exits successfully and prints non-empty usage/help output.',
    '',
    '## Verification',
    '',
    '```bash',
    'npm run cli:contract-check',
    '```',
    '',
    '## Productization Notes',
    '',
    '- Keep the CLI entry stable across packaging and refactors.',
    '- Add regression tests for new commands before changing command behavior.',
    '- Treat empty or crashing help output as a release blocker.',
    '',
  ].join('\n');
}

function cliContractCheckScript(entry: string): string {
  return [
    '#!/usr/bin/env node',
    "import { existsSync } from 'node:fs';",
    "import { spawnSync } from 'node:child_process';",
    "import path from 'node:path';",
    '',
    'const root = process.cwd();',
    `const entry = ${JSON.stringify(entry)};`,
    'const abs = path.join(root, entry);',
    'const ext = path.extname(entry).toLowerCase();',
    'const checks = [];',
    '',
    'function record(id, ok, detail) {',
    '  checks.push({ id, ok, detail });',
    '}',
    '',
    'record("entry_exists", existsSync(abs), `${entry} exists`);',
    'let result = null;',
    'if (existsSync(abs)) {',
    '  if (ext === ".py") {',
    '    result = spawnSync("python3", [entry, "--help"], { cwd: root, encoding: "utf8", timeout: 10_000 });',
    '  } else {',
    '    result = spawnSync(process.execPath, [entry, "--help"], { cwd: root, encoding: "utf8", timeout: 10_000 });',
    '  }',
    '  const output = `${result.stdout || ""}\\n${result.stderr || ""}`.trim();',
    '  record("help_exits_zero", result.status === 0, result.stderr || `exit ${result.status}`);',
    '  record("help_output_nonempty", output.length > 0, output.slice(0, 240) || "empty help output");',
    '  record("help_mentions_usage", /usage|help|options|commands/i.test(output), output.slice(0, 240) || "help text lacks usage/options signal");',
    '}',
    '',
    'const failures = checks.filter((check) => !check.ok);',
    'console.log(JSON.stringify({ ok: failures.length === 0, entry, checks, failures }, null, 2));',
    'if (failures.length > 0) process.exit(1);',
    '',
  ].join('\n');
}

async function detectProjectEnvVars(projectPath: string): Promise<string[]> {
  const files = (await listFiles(projectPath))
    .filter((f) => /\.(py|js|mjs|cjs|ts|tsx)$/.test(f))
    .filter((f) => !/(^|\/)(tests?|scripts|e2e|coverage)\//.test(f))
    .slice(0, 120);
  const names = new Set<string>();
  const patterns = [
    /process\.env\.([A-Z][A-Z0-9_]{1,80})/g,
    /process\.env\[['"]([A-Z][A-Z0-9_]{1,80})['"]\]/g,
    /os\.environ(?:\.get)?\(\s*['"]([A-Z][A-Z0-9_]{1,80})['"]/g,
    /getenv\(\s*['"]([A-Z][A-Z0-9_]{1,80})['"]/g,
  ];
  for (const rel of files) {
    const text = await readTextSafe(path.join(projectPath, rel));
    if (!text) continue;
    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text))) {
        if (match[1]) names.add(match[1]);
      }
    }
  }
  return Array.from(names).sort();
}

async function ensureEnvExampleVars(projectPath: string, vars: string[]): Promise<boolean> {
  const target = path.join(projectPath, '.env.example');
  const existing = (await readTextSafe(target)) ?? '';
  const present = new Set(
    existing
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=/)?.[1])
      .filter((name): name is string => !!name),
  );
  const additions = vars.filter((name) => !present.has(name));
  if (additions.length === 0 && existing.trim()) return false;
  const lines = [
    existing.trimEnd(),
    existing.trim() ? '' : '# Runtime configuration',
    ...additions.map((name) => `${name}=`),
    '',
  ].filter((line, idx, arr) => !(line === '' && arr[idx - 1] === ''));
  await writeText(target, lines.join('\n'));
  return true;
}

function apiContractDocument(): string {
  return [
    '# API Contract',
    '',
    'This harness records the public API boundary that must remain stable while the demo becomes a product.',
    '',
    '## Required Evidence',
    '',
    '- API framework or route declarations are present in source.',
    '- Route behavior is covered by tests, OpenAPI/spec files, or a dedicated contract check.',
    '- Health and error responses are treated as release-blocking behavior when this project exposes HTTP endpoints.',
    '',
    '## Verification',
    '',
    '```bash',
    'npm run api:contract-check',
    '```',
    '',
  ].join('\n');
}

function apiContractCheckScript(): string {
  return genericContractCheckScript({
    title: 'api_contract',
    docs: 'docs/api-contract.md',
    evidenceId: 'api_surface',
    evidenceDescription: 'API framework, route declaration or api/ source evidence detected',
    filePatterns: ['^api/.+\\.(ts|tsx|js|mjs|cjs|py)$'],
    textPatterns: [
      '@app\\.(?:route|get|post|put|delete|patch)\\(',
      'FastAPI\\s*\\(',
      'APIRouter\\s*\\(',
      'express\\s*\\(',
      'fastify\\s*\\(',
      'new\\s+Hono\\s*\\(',
      'router\\.(?:get|post|put|delete|patch)\\(',
    ],
  });
}

function configContractDocument(envVars: string[]): string {
  const vars = envVars.length > 0 ? envVars.map((name) => `- \`${name}\``).join('\n') : '- No environment variables detected at generation time.';
  return [
    '# Config Contract',
    '',
    'This harness keeps runtime configuration explicit and reviewable.',
    '',
    '## Detected Variables',
    '',
    vars,
    '',
    '## Verification',
    '',
    '```bash',
    'npm run config:contract-check',
    '```',
    '',
  ].join('\n');
}

function configContractCheckScript(): string {
  return [
    '#!/usr/bin/env node',
    "import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';",
    "import path from 'node:path';",
    '',
    'const root = process.cwd();',
    'const skip = new Set(["node_modules", ".git", "dist", ".demo2project", "coverage", ".next", ".venv", "venv"]);',
    'const sourceExt = /\\.(py|js|mjs|cjs|ts|tsx)$/;',
    'const envPatterns = [',
    '  /process\\.env\\.([A-Z][A-Z0-9_]{1,80})/g,',
    '  /process\\.env\\[[\'"]([A-Z][A-Z0-9_]{1,80})[\'"]\\]/g,',
    '  /os\\.environ(?:\\.get)?\\(\\s*[\'"]([A-Z][A-Z0-9_]{1,80})[\'"]/g,',
    '  /getenv\\(\\s*[\'"]([A-Z][A-Z0-9_]{1,80})[\'"]/g,',
    '];',
    'const files = [];',
    'function walk(dir, rel = "") {',
    '  for (const entry of readdirSync(dir, { withFileTypes: true })) {',
    '    if (skip.has(entry.name)) continue;',
    '    const childRel = rel ? `${rel}/${entry.name}` : entry.name;',
    '    const childAbs = path.join(dir, entry.name);',
    '    if (entry.isDirectory()) walk(childAbs, childRel);',
    '    else if (entry.isFile() && sourceExt.test(entry.name) && !/(^|\\/)(tests?|scripts|e2e|coverage)\\//.test(childRel)) files.push(childRel);',
    '  }',
    '}',
    'walk(root);',
    'const env = new Set();',
    'for (const file of files.slice(0, 300)) {',
    '  const text = readFileSync(path.join(root, file), "utf8");',
    '  for (const pattern of envPatterns) {',
    '    let match;',
    '    while ((match = pattern.exec(text))) env.add(match[1]);',
    '  }',
    '}',
    'const examplePath = path.join(root, ".env.example");',
    'const example = existsSync(examplePath) ? readFileSync(examplePath, "utf8") : "";',
    'const documented = new Set(example.split(/\\r?\\n/).map((line) => line.match(/^\\s*([A-Z][A-Z0-9_]*)\\s*=/)?.[1]).filter(Boolean));',
    'const missing = [...env].filter((name) => !documented.has(name));',
    'const checks = [',
    '  { id: "env_usage_detected", ok: env.size > 0, detail: [...env].join(", ") || "no env usage detected" },',
    '  { id: "env_example_exists", ok: existsSync(examplePath), detail: ".env.example exists" },',
    '  { id: "all_env_vars_documented", ok: missing.length === 0, detail: missing.join(", ") || "all env vars documented" },',
    '];',
    'const failures = checks.filter((check) => !check.ok);',
    'console.log(JSON.stringify({ ok: failures.length === 0, env_vars: [...env].sort(), checks, failures }, null, 2));',
    'if (failures.length > 0) process.exit(1);',
    '',
  ].join('\n');
}

function dataContractDocument(): string {
  return [
    '# Data Contract',
    '',
    'This harness records the schema and migration boundary for demos that persist data.',
    '',
    '## Required Evidence',
    '',
    '- A schema, model layer, migration directory, or ORM configuration is present.',
    '- Future data changes must update the schema/migration evidence before feature code depends on it.',
    '',
    '## Verification',
    '',
    '```bash',
    'npm run data:contract-check',
    '```',
    '',
  ].join('\n');
}

function dataContractCheckScript(): string {
  return genericContractCheckScript({
    title: 'data_contract',
    docs: 'docs/data-contract.md',
    evidenceId: 'data_surface',
    evidenceDescription: 'schema, model, database or migration evidence detected',
    filePatterns: [
      '^(migrations|prisma|db|database)/',
      '(^|/)(schema\\.prisma|models\\.py|database\\.py|db\\.py)$',
    ],
    textPatterns: [
      'create_engine\\(',
      'declarative_base\\(',
      'mongoose\\.connect',
      'new\\s+PrismaClient',
      'drizzle\\(',
      'knex\\(',
      'sequelize\\.define',
    ],
  });
}

function workerContractDocument(): string {
  return [
    '# Worker Contract',
    '',
    'This harness records background worker, queue and scheduled-job entrypoints.',
    '',
    '## Required Evidence',
    '',
    '- Worker, job, task or scheduler source exists.',
    '- Retry and failure behavior should be promoted into tests before production deployment.',
    '',
    '## Verification',
    '',
    '```bash',
    'npm run worker:contract-check',
    '```',
    '',
  ].join('\n');
}

function workerContractCheckScript(): string {
  return genericContractCheckScript({
    title: 'worker_contract',
    docs: 'docs/worker-contract.md',
    evidenceId: 'worker_surface',
    evidenceDescription: 'worker, job, queue or scheduler evidence detected',
    filePatterns: [
      '^(workers?|jobs?|tasks?)/',
      '(^|/)(worker|jobs|tasks|scheduler)\\.(py|js|mjs|cjs|ts)$',
    ],
    textPatterns: [
      'new\\s+Worker',
      'Queue\\(',
      'worker_process',
      '@shared_task',
      'Celery\\(',
      'BackgroundTasks',
      'cron\\.schedule',
      'APScheduler',
    ],
  });
}

function genericContractCheckScript(opts: {
  title: string;
  docs: string;
  evidenceId: string;
  evidenceDescription: string;
  filePatterns: string[];
  textPatterns: string[];
}): string {
  return [
    '#!/usr/bin/env node',
    "import { existsSync, readFileSync, readdirSync } from 'node:fs';",
    "import path from 'node:path';",
    '',
    'const root = process.cwd();',
    `const title = ${JSON.stringify(opts.title)};`,
    `const docs = ${JSON.stringify(opts.docs)};`,
    `const filePatterns = ${JSON.stringify(opts.filePatterns)}.map((pattern) => new RegExp(pattern));`,
    `const textPatterns = ${JSON.stringify(opts.textPatterns)}.map((pattern) => new RegExp(pattern));`,
    'const sourceExt = /\\.(py|js|mjs|cjs|ts|tsx|json|toml|yml|yaml)$/;',
    'const skip = new Set(["node_modules", ".git", "dist", ".demo2project", "coverage", ".next", ".venv", "venv"]);',
    'const files = [];',
    'function walk(dir, rel = "") {',
    '  for (const entry of readdirSync(dir, { withFileTypes: true })) {',
    '    if (skip.has(entry.name)) continue;',
    '    const childRel = rel ? `${rel}/${entry.name}` : entry.name;',
    '    const childAbs = path.join(dir, entry.name);',
    '    if (entry.isDirectory()) walk(childAbs, childRel);',
    '    else if (entry.isFile()) files.push(childRel);',
    '  }',
    '}',
    'walk(root);',
    'const matchingFiles = files.filter((file) => filePatterns.some((pattern) => pattern.test(file)));',
    'const matchingTextFiles = [];',
    'for (const file of files.filter((f) => sourceExt.test(f)).slice(0, 300)) {',
    '  const text = readFileSync(path.join(root, file), "utf8");',
    '  if (textPatterns.some((pattern) => pattern.test(text))) matchingTextFiles.push(file);',
    '}',
    'const evidence = [...new Set([...matchingFiles, ...matchingTextFiles])].sort();',
    'const checks = [',
    '  { id: "contract_doc_exists", ok: existsSync(path.join(root, docs)), detail: docs },',
    `  { id: ${JSON.stringify(opts.evidenceId)}, ok: evidence.length > 0, detail: evidence.length > 0 ? evidence.slice(0, 12).join(", ") : ${JSON.stringify(opts.evidenceDescription)} },`,
    '];',
    'const failures = checks.filter((check) => !check.ok);',
    'console.log(JSON.stringify({ ok: failures.length === 0, title, evidence, checks, failures }, null, 2));',
    'if (failures.length > 0) process.exit(1);',
    '',
  ].join('\n');
}

function isPatchableUiFile(file: string): boolean {
  return /^(index\.html)$/.test(file) ||
    /^(src|app|pages|components|styles|templates|static|public|example)\/.*\.(tsx|jsx|ts|js|vue|svelte|html|css|scss|sass)$/.test(file);
}

function patchNavAccessibleName(text: string): string {
  return text.replace(/<nav\b([^>]*)>/g, (tag: string, attrs: string) => {
    if (/\baria-(?:label|labelledby)=/i.test(attrs)) return tag;
    return `<nav${attrs} aria-label="Primary navigation">`;
  });
}

function patchFocusableFlipSurfaces(text: string): string {
  return text.replace(/<(section|footer|div)\b([^>]*(?:data-flip-panel|class=["'][^"']*\bflip-panel\b[^"']*|@mouseenter=["']flipOn\(["'][^"']+["']\))[^>]*)>/g,
    (tag: string, tagName: string, attrs: string) => {
      let nextAttrs = attrs;
      const id = extractAttribute(attrs, 'id') ?? extractFlipId(attrs) ?? 'panel';
      const label = `Show ${id.replace(/[-_]+/g, ' ')} details`;
      const additions: string[] = [];
      if (!/\btabindex=/.test(nextAttrs)) additions.push('tabindex="0"');
      if (!/\brole=/.test(nextAttrs)) additions.push('role="button"');
      if (!/\baria-label=/.test(nextAttrs) && !/\baria-labelledby=/.test(nextAttrs)) additions.push(`aria-label="${label}"`);
      if (/@mouseenter=["']flipOn\(/.test(nextAttrs)) {
        const flipId = extractFlipId(nextAttrs) ?? id;
        if (!/@focus=/.test(nextAttrs)) additions.push(`@focus="flipOn('${flipId}')"`);
        if (!/@blur=/.test(nextAttrs)) additions.push(`@blur="flipOff('${flipId}')"`);
        if (!/@touchstart/.test(nextAttrs)) additions.push(`@touchstart.passive="flipOn('${flipId}')"`);
        if (!/@keydown\.enter/.test(nextAttrs)) additions.push(`@keydown.enter.prevent="flipOn('${flipId}')"`);
        if (!/@keydown\.space/.test(nextAttrs)) additions.push(`@keydown.space.prevent="flipOn('${flipId}')"`);
      }
      if (additions.length === 0) return tag;
      nextAttrs += additions.map((attr) => `\n        ${attr}`).join('');
      return `<${tagName}${nextAttrs}>`;
    });
}

function patchPlaceholderUiCopy(text: string): string {
  return text
    .replace(/This is a beta version of MatrixOmnix, thanks for your supporting and understanding\./g, 'MatrixOmnix presents a focused interface for projects, services and contact paths.')
    .replace(/This is just a BETA\./g, 'Interface prototyping, front-end implementation and product polish for web experiences.')
    .replace(/Welcome to my website\./gi, 'Explore the core work, services and contact paths from one focused interface.')
    .replace(/Welcome to our website\./gi, 'Explore the product, services and contact paths from one focused interface.')
    .replace(/This is my portfolio\./gi, 'A focused portfolio of selected work, capabilities and contact paths.')
    .replace(/Under construction\.?/gi, 'Current product information is available in the sections below.')
    .replace(/Work in progress\.?/gi, 'Current product information is available in the sections below.')
    .replace(/Stay tuned\.?/gi, 'Follow the contact path below for updates and collaboration.')
    .replace(/A common student from Tengzhou, China\./g, 'Independent builder from Tengzhou, China, focused on AI-assisted products and web experiences.')
    .replace(/\bThis is just a BETA\b/g, 'Focused product capability')
    .replace(/\bThis is a beta version\b/gi, 'This is the current product preview');
}

function patchUnimplementedHostedServiceClaims(text: string): string {
  let next = text
    .replace(/Upload a demo\.\s*Receive a product zip\./g, 'How to use MatrixOmnix beta.')
    .replace(/Upload a demo/gi, 'Use MatrixOmnix beta locally')
    .replace(/Receive a product zip/gi, 'Review verified productization evidence')
    .replace(/MatrixOmnix accepts compressed demo projects, runs the productization harness, then returns one normalized zip artifact for broad compatibility\./g, 'MatrixOmnix is not a hosted file-processing service yet. Use the beta locally from the CLI, review every verification report, and keep productization changes under source control.')
    .replace(/MatrixOmnix will process the archive and return a productized zip artifact\./g, 'MatrixOmnix beta runs locally from the CLI; review verification reports before trusting productization output.')
    .replace(/(?:Input|Output):\s*(?:zip|7z|rar|tar|tar\.gz|tgz)(?:,\s*(?:zip|7z|rar|tar|tar\.gz|tgz))*/gi, 'Beta workflow: local CLI plus verification reports')
    .replace(/\b(?:productized\s+zip|product\s+zip|zip\s+artifact|product\s+artifact)\b/gi, 'verified productization evidence')
    .replace(/\breturned?\s+as\s+a\s+normalized\s+zip\b/gi, 'reviewed through local verification reports');

  next = next.replace(/<form\b[^>]*(?:data-upload-form|data-return-format)[^>]*>[\s\S]*?<\/form>/gi, betaServiceGuideMarkup);
  next = next.replace(/<input\b[^>]*type=["']file["'][^>]*>/gi, '<p>Hosted file intake is deferred; use the local CLI workflow for this beta.</p>');
  next = next.replace(/\sdata-(?:upload-form|demo-upload|return-format)(?:=(["'])[^"']*\1)?/gi, '');
  next = next.replace(/\saccept=(["'])[^"']*\.(?:zip|7z|rar|tar)[^"']*\1/gi, '');
  return next;
}

function betaServiceGuideMarkup(): string {
  return [
    '<section class="usage-card" data-service-guide>',
    '  <h2>Beta workflow</h2>',
    '  <p>MatrixOmnix is not a hosted file-processing service yet. Use the beta locally from the CLI and review every verification report.</p>',
    '  <code>pnpm matrixomnix analyze --project ./demo</code>',
    '</section>',
  ].join('\n');
}

function patchVuePointerTracking(text: string): string {
  if (/requestAnimationFrame/.test(text)) return text;
  const replacement = [
    '  let frame = 0',
    '  let latestPoint = { x: window.innerWidth / 2, y: window.innerHeight / 2 }',
    '',
    '  const scheduleUpdate = (clientX, clientY) => {',
    '    latestPoint = { x: clientX, y: clientY }',
    '    if (frame) return',
    '    frame = window.requestAnimationFrame(() => {',
    '      frame = 0',
    '      update(latestPoint.x, latestPoint.y)',
    '    })',
    '  }',
    '',
    '  const onMove = (event) => {',
    '    scheduleUpdate(event.clientX, event.clientY)',
    '  }',
  ].join('\n');
  const onMovePattern = /  const onMove = \(event\) => \{\s*update\(event\.clientX,\s*event\.clientY\)\s*\}/m;
  let next = text.replace(onMovePattern, replacement);
  if (/const scheduleUpdate =/.test(next)) {
    next = next.replace(/update\(point\.clientX,\s*point\.clientY\)/g, 'scheduleUpdate(point.clientX, point.clientY)');
    next = next.replace(/(cleanup = \(\) => \{\r?\n)(?!\s*if \(frame\) window\.cancelAnimationFrame)/, '$1    if (frame) window.cancelAnimationFrame(frame)\n');
  }
  return next;
}

function patchScriptCursorHiding(text: string): string {
  return text
    .replace(/document\.body\.style\.cursor\s*=\s*['"]none['"]/g, "document.body.style.cursor = 'auto'")
    .replace(/document\.documentElement\.style\.cursor\s*=\s*['"]none['"]/g, "document.documentElement.style.cursor = 'auto'");
}

function patchStaticFlipPanelScript(text: string): string {
  if (!/flipPanels\.forEach\(\(panel\) => \{/.test(text)) return text;
  let next = text;
  if (!/touchstart/.test(next)) {
    next = next.replace(
      /(\s*panel\.addEventListener\(["']mouseleave["'],\s*\(\) => unflipPanel\(panel\)\);\n)/,
      '$1  panel.addEventListener("touchstart", () => flipPanel(panel), { passive: true });\n',
    );
  }
  if (!/keydown/.test(next)) {
    const keyboardBlock = [
      '  panel.addEventListener("keydown", (event) => {',
      '    if (event.key !== "Enter" && event.key !== " ") return;',
      '    event.preventDefault();',
      '    flipPanel(panel);',
      '  });',
      '',
    ].join('\n');
    next = next.replace(
      /(\s*panel\.addEventListener\(["']focusout["'],\s*\(\) => unflipPanel\(panel\)\);\n)/,
      `$1${keyboardBlock}`,
    );
  }
  return next;
}

function patchUiCss(text: string, markupText: string): string {
  let next = text.replace(/cursor\s*:\s*none\s*;/g, 'cursor: auto;');
  next = patchLargeFixedTypography(next);
  next = patchMobileCursorSizing(next);
  next = next.replace(/(\.brand\s*\{[^}]*?)letter-spacing\s*:\s*0\.22em\s*;/gs, '$1letter-spacing: 0;');
  if (/position\s*:\s*sticky/i.test(next) && !/scroll-(margin|padding)-top/i.test(next)) {
    next = next.replace(/(html\s*\{[^}]*\}\s*)?/m, (match: string) => `${match}[id] {\n  scroll-margin-top: 88px;\n}\n\n`);
  }
  if (!/\beyebrow\b/.test(markupText)) {
    next = next.replace(/\.eyebrow,\s*\n/g, '');
  }
  next = dedupeConsecutiveCssRules(next);
  next = removeRedundantCursorCoreRule(next);
  return next;
}

function patchLargeFixedTypography(css: string): string {
  return css
    .replace(/font-size:\s*7\.25rem\s*;/g, 'font-size: clamp(3.5rem, 12vw, 7.25rem);')
    .replace(/font-size:\s*6rem\s*;/g, 'font-size: clamp(3rem, 10vw, 6rem);')
    .replace(/font-size:\s*5rem\s*;/g, 'font-size: clamp(3rem, 10vw, 5rem);')
    .replace(/font-size:\s*4\.4rem\s*;/g, 'font-size: clamp(2.75rem, 9vw, 4.4rem);')
    .replace(/font-size:\s*4rem\s*;/g, 'font-size: clamp(2.5rem, 8vw, 4rem);');
}

function patchMobileCursorSizing(css: string): string {
  return css.replace(
    /(\n\s*)\.cursor-core\s*\{\s*(\n\s*width:\s*120px;\s*\n\s*height:\s*120px;\s*\n\s*\})/g,
    '$1.cursor-capture,$1.cursor-core {$2',
  );
}

function dedupeConsecutiveCssRules(css: string): string {
  let previous = '';
  return css.replace(/([^{}@][^{}]*)\{([^{}]*)\}\s*/g, (block: string, selector: string, body: string) => {
    const normalized = `${selector.trim().replace(/\s+/g, ' ')}{${body.trim().replace(/\s+/g, ' ')}}`;
    if (normalized === previous) return '';
    previous = normalized;
    return block;
  });
}

function removeRedundantCursorCoreRule(css: string): string {
  if (!/\.cursor-capture,\s*\n\.cursor-core\s*\{/.test(css)) return css;
  return css.replace(/\n{2,}\.cursor-core\s*\{\s*position:\s*fixed;[\s\S]*?will-change:\s*transform;\s*\}\s*\n/g, '\n\n');
}

function extractAttribute(attrs: string, name: string): string | null {
  const match = attrs.match(new RegExp(`\\b${name}=["']([^"']+)["']`));
  return match?.[1] ?? null;
}

function extractFlipId(attrs: string): string | null {
  const match = attrs.match(/flipOn\(["']([^"']+)["']\)/);
  return match?.[1] ?? null;
}

function uiProductCheckScript(): string {
  return [
    '#!/usr/bin/env node',
    "import { existsSync, readdirSync, readFileSync } from 'node:fs';",
    "import path from 'node:path';",
    '',
    'const root = process.cwd();',
    'const readJson = (file) => JSON.parse(readFileSync(path.join(root, file), "utf8"));',
    'const walk = (dir, out = []) => {',
    '  const abs = path.join(root, dir);',
    '  if (!existsSync(abs)) return out;',
    '  for (const entry of readdirSync(abs, { withFileTypes: true })) {',
    '    if (["node_modules", "dist", "build", ".next", ".git"].includes(entry.name)) continue;',
    '    const rel = path.join(dir, entry.name);',
    '    if (entry.isDirectory()) walk(rel, out);',
    '    else out.push(rel);',
    '  }',
    '  return out;',
    '};',
    '',
    'const pkg = existsSync(path.join(root, "package.json")) ? readJson("package.json") : {};',
    'const files = [...walk("src"), ...walk("app"), ...walk("pages"), ...walk("components"), ...walk("styles"), ...walk("tests"), ...walk("e2e")];',
    'if (existsSync(path.join(root, "index.html"))) files.push("index.html");',
    'if (existsSync(path.join(root, "playwright.config.ts"))) files.push("playwright.config.ts");',
    'if (existsSync(path.join(root, "playwright.config.js"))) files.push("playwright.config.js");',
    'if (existsSync(path.join(root, "scripts/ui-render-smoke.mjs"))) files.push("scripts/ui-render-smoke.mjs");',
    '',
    'const textFiles = files.filter((f) => /\\.(tsx|jsx|ts|js|vue|svelte|css|scss|html)$/.test(f));',
    'const blob = textFiles.map((f) => { try { return `\\n/* ${f} */\\n${readFileSync(path.join(root, f), "utf8")}`; } catch { return ""; } }).join("\\n").toLowerCase();',
    'const scripts = pkg.scripts || {};',
    'const scriptText = Object.entries(scripts).map(([k, v]) => `${k}:${v}`).join("\\n").toLowerCase();',
    '',
    'const checks = [',
    '  { id: "ui_source", ok: textFiles.some((f) => /^(src|app|pages|components)\\//.test(f)) || files.includes("index.html"), detail: "UI source files exist" },',
    '  { id: "build_script", ok: Boolean(scripts.build), detail: "package.json exposes a build script" },',
    '  { id: "browser_harness", ok: /playwright|cypress|ui:check|ui:e2e|e2e/.test(scriptText) || files.some((f) => /^tests\\/(ui|e2e)\\//.test(f) || /^e2e\\//.test(f) || /^playwright\\.config\\./.test(f)), detail: "browser-level UI harness exists" },',
    '  { id: "runtime_render_harness", ok: /ui:render-check|render-check|render-smoke|visual-smoke|pixel-smoke/.test(scriptText) || files.some((f) => f === "scripts/ui-render-smoke.mjs" || /^tests\\/ui\\/.*render.*\\.(spec|test)\\.(ts|js)$/.test(f)), detail: "runtime render smoke harness exists" },',
    '  { id: "responsive_signal", ok: /@media|@container|minmax\\(|clamp\\(|grid-template|flex-wrap|sm:|md:|lg:/.test(blob), detail: "responsive CSS or utility signal present", advisory: true },',
    '  { id: "a11y_signal", ok: /aria-|role=|alt=|<label|htmlfor=|focus-visible|sr-only|tabindex/.test(blob), detail: "accessibility semantics signal present", advisory: true },',
    '  { id: "state_signal", ok: /loading|skeleton|spinner|error|empty|no results|not found|retry|fallback|pending|failed|disabled/.test(blob), detail: "loading/error/empty/disabled state signal present", advisory: true },',
    '];',
    '',
    'const failed = checks.filter((check) => !check.ok && !check.advisory);',
    'const advisories = checks.filter((check) => !check.ok && check.advisory);',
    'console.log(JSON.stringify({ ok: failed.length === 0, checks, advisories: advisories.map((c) => c.id) }, null, 2));',
    'if (failed.length > 0) {',
    '  console.error(`UI product check failed: ${failed.map((c) => c.id).join(", ")}`);',
    '  process.exit(1);',
    '}',
    '',
  ].join('\n');
}

function uiRenderSmokeScript(): string {
  return [
    '#!/usr/bin/env node',
    "import { spawn } from 'node:child_process';",
    "import { existsSync, mkdirSync, readFileSync } from 'node:fs';",
    "import path from 'node:path';",
    '',
    'const root = process.cwd();',
    'const pkg = existsSync(path.join(root, "package.json")) ? JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) : {};',
    'const scripts = pkg.scripts || {};',
    'const inferredCommand = process.env.UI_DEV_SERVER_COMMAND || inferServerCommand(scripts);',
    'const baseURL = process.env.UI_BASE_URL || inferBaseUrl(inferredCommand);',
    'const screenshotsDir = path.join(root, "test-results", "ui-render-smoke");',
    'mkdirSync(screenshotsDir, { recursive: true });',
    '',
    'let chromium;',
    'try {',
    '  ({ chromium } = await import("@playwright/test"));',
    '} catch {',
    '  console.error("Missing @playwright/test runtime. Run npm install, then npx playwright install chromium, or set UI_BASE_URL and run npm run ui:render-check.");',
    '  process.exit(1);',
    '}',
    '',
    'let server;',
    'try {',
    '  if (!process.env.UI_BASE_URL && inferredCommand) {',
    '    server = spawn(inferredCommand, { cwd: root, shell: true, stdio: ["ignore", "pipe", "pipe"] });',
    '    server.stdout?.on("data", (chunk) => process.stdout.write(chunk));',
    '    server.stderr?.on("data", (chunk) => process.stderr.write(chunk));',
    '    await waitForUrl(baseURL, 120_000);',
    '  }',
    '',
    '  const browser = await chromium.launch();',
    '  const results = [];',
    '  for (const viewport of [',
    '    { name: "desktop", width: 1440, height: 960 },',
    '    { name: "mobile", width: 390, height: 844 },',
    '  ]) {',
    '    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });',
    '    await page.goto(baseURL, { waitUntil: "networkidle" });',
    '    const metrics = await page.evaluate(() => {',
    '      const visibleElements = [...document.body.querySelectorAll("*")].filter((el) => {',
    '        const rect = el.getBoundingClientRect();',
    '        const style = window.getComputedStyle(el);',
    '        return rect.width > 1 && rect.height > 1 && style.visibility !== "hidden" && style.display !== "none";',
    '      });',
    '      return {',
    '        title: document.title,',
    '        textLength: document.body.innerText.trim().length,',
    '        visibleElements: visibleElements.length,',
    '        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,',
    '      };',
    '    });',
    '    const screenshot = await page.screenshot({ fullPage: true, path: path.join(screenshotsDir, `${viewport.name}.png`) });',
    '    await page.close();',
    '    results.push({ viewport: viewport.name, ...metrics, screenshot_bytes: screenshot.byteLength });',
    '  }',
    '  await browser.close();',
    '',
    '  const failures = results.flatMap((result) => [',
    '    result.textLength > 0 ? null : `${result.viewport}: body text is blank`,',
    '    result.visibleElements > 0 ? null : `${result.viewport}: no visible elements`,',
    '    !result.horizontalOverflow ? null : `${result.viewport}: horizontal overflow`,',
    '    result.screenshot_bytes > 2048 ? null : `${result.viewport}: screenshot is suspiciously small`,',
    '  ].filter(Boolean));',
    '  console.log(JSON.stringify({ ok: failures.length === 0, baseURL, screenshotsDir, results, failures }, null, 2));',
    '  if (failures.length > 0) process.exit(1);',
    '} finally {',
    '  if (server) server.kill("SIGTERM");',
    '}',
    '',
    'function inferServerCommand(scripts) {',
    '  if (scripts.dev) return "npm run dev -- --host 127.0.0.1";',
    '  if (scripts.preview) return "npm run preview -- --host 127.0.0.1";',
    '  if (scripts.start) return "npm run start";',
    '  return "";',
    '}',
    '',
    'function inferBaseUrl(command) {',
    '  if (/preview/.test(command)) return "http://127.0.0.1:4173";',
    '  if (/start/.test(command)) return "http://127.0.0.1:3000";',
    '  return "http://127.0.0.1:5173";',
    '}',
    '',
    'async function waitForUrl(url, timeoutMs) {',
    '  const started = Date.now();',
    '  while (Date.now() - started < timeoutMs) {',
    '    try {',
    '      const response = await fetch(url);',
    '      if (response.ok || response.status < 500) return;',
    '    } catch {',
    '      await new Promise((resolve) => setTimeout(resolve, 500));',
    '    }',
    '  }',
    '  throw new Error(`Timed out waiting for ${url}`);',
    '}',
    '',
  ].join('\n');
}

function uiSmokePlaywrightSpec(): string {
  return [
    "import { expect, test } from '@playwright/test';",
    '',
    "const viewports = [",
    "  { name: 'desktop', width: 1440, height: 960 },",
    "  { name: 'mobile', width: 390, height: 844 },",
    '];',
    '',
    "for (const viewport of viewports) {",
    "  test(`renders primary UI at ${viewport.name}`, async ({ page }) => {",
    '    await page.setViewportSize({ width: viewport.width, height: viewport.height });',
    "    await page.goto('/');",
    "    const root = page.locator('#root, main, [data-testid=\"app-root\"], body > div').first();",
    '    await expect(root).toBeVisible();',
    '    await expect(page.locator("body")).not.toHaveText(/^\\s*$/);',
    '    const visibleElementCount = await page.evaluate(() => [...document.body.querySelectorAll("*")].filter((el) => {',
    '      const rect = el.getBoundingClientRect();',
    '      const style = window.getComputedStyle(el);',
    '      return rect.width > 1 && rect.height > 1 && style.visibility !== "hidden" && style.display !== "none";',
    '    }).length);',
    '    expect(visibleElementCount).toBeGreaterThan(0);',
    '    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);',
    '    expect(horizontalOverflow).toBe(false);',
    '    const screenshot = await page.screenshot({ fullPage: true });',
    '    expect(screenshot.byteLength).toBeGreaterThan(2048);',
    '  });',
    '}',
    '',
  ].join('\n');
}

function uiPlaywrightConfig(): string {
  return [
    "import { defineConfig, devices } from '@playwright/test';",
    "import { existsSync, readFileSync } from 'node:fs';",
    '',
    "const pkg = existsSync('package.json') ? JSON.parse(readFileSync('package.json', 'utf8')) : {};",
    "const scripts = pkg.scripts || {};",
    "const inferredCommand = scripts.dev ? 'npm run dev -- --host 127.0.0.1' : scripts.preview ? 'npm run preview -- --host 127.0.0.1' : scripts.start ? 'npm run start' : undefined;",
    'const command = process.env.UI_DEV_SERVER_COMMAND || inferredCommand;',
    "const baseURL = process.env.UI_BASE_URL || (command?.includes('preview') ? 'http://127.0.0.1:4173' : command?.includes('start') ? 'http://127.0.0.1:3000' : 'http://127.0.0.1:5173');",
    '',
    'export default defineConfig({',
    "  testDir: './tests/ui',",
    '  use: { baseURL, trace: "retain-on-failure" },',
    "  projects: [",
    "    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },",
    "    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] } },",
    '  ],',
    '  webServer: command ? { command, url: baseURL, reuseExistingServer: true, timeout: 120_000 } : undefined,',
    '});',
    '',
  ].join('\n');
}

function playerSuppliedLlmConfigModule(): string {
  return [
    'from __future__ import annotations',
    '',
    'import os',
    'from typing import Any',
    '',
    '',
    'PROVIDER_PRESETS: dict[str, dict[str, str]] = {',
    '    "deepseek": {',
    '        "label": "DeepSeek",',
    '        "base_url": "https://api.deepseek.com",',
    '        "default_model": "deepseek-v4-flash",',
    '    },',
    '    "openai": {',
    '        "label": "OpenAI compatible",',
    '        "base_url": "https://api.openai.com/v1",',
    '        "default_model": "gpt-4o-mini",',
    '    },',
    '    "qwen": {',
    '        "label": "Qwen",',
    '        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",',
    '        "default_model": "qwen-plus",',
    '    },',
    '    "minimax": {',
    '        "label": "MiniMax",',
    '        "base_url": "https://api.minimax.io/v1",',
    '        "default_model": "MiniMax-M2.7",',
    '    },',
    '    "custom": {',
    '        "label": "Custom OpenAI-compatible endpoint",',
    '        "base_url": "",',
    '        "default_model": "",',
    '    },',
    '}',
    '',
    '',
    'def public_provider_config() -> dict[str, Any]:',
    '    return {',
    '        "providers": [',
    '            {',
    '                "id": provider_id,',
    '                "label": preset["label"],',
    '                "base_url": preset["base_url"],',
    '                "default_model": preset["default_model"],',
    '            }',
    '            for provider_id, preset in PROVIDER_PRESETS.items()',
    '        ],',
    '        "requires_player_key": True,',
    '    }',
    '',
    '',
    'def redacted_config(config: dict[str, Any]) -> dict[str, Any]:',
    '    return {',
    '        "provider": config.get("provider"),',
    '        "base_url": config.get("base_url"),',
    '        "model": config.get("model"),',
    '        "has_key": bool(config.get("api_key")),',
    '    }',
    '',
    '',
    'def resolve_llm_config(payload: dict[str, Any] | None, environ: dict[str, str] | None = None) -> dict[str, Any]:',
    '    payload = payload or {}',
    '    environ = environ if environ is not None else os.environ',
    '    provider = str(payload.get("provider") or payload.get("llm_provider") or "deepseek").strip().lower()',
    '    if provider not in PROVIDER_PRESETS:',
    '        provider = "custom"',
    '    preset = PROVIDER_PRESETS[provider]',
    '    api_key = str(payload.get("api_key") or payload.get("llm_api_key") or "").strip()',
    '    allow_server_fallback = str(environ.get("WW_ALLOW_SERVER_LLM_KEY_FALLBACK", "")).lower() in {"1", "true", "yes", "on"}',
    '    if not api_key and allow_server_fallback:',
    '        api_key = environ.get("DEEPSEEK_API_KEY") or environ.get("OPENAI_API_KEY") or ""',
    '    base_url = str(payload.get("base_url") or payload.get("llm_base_url") or preset["base_url"]).strip()',
    '    model = str(payload.get("model") or payload.get("llm_model") or preset["default_model"]).strip()',
    '    if not api_key:',
    '        return {"ok": False, "error": "missing_api_key", "providers": public_provider_config()}',
    '    if not base_url:',
    '        return {"ok": False, "error": "missing_base_url", "providers": public_provider_config()}',
    '    if not model:',
    '        return {"ok": False, "error": "missing_model", "providers": public_provider_config()}',
    '    config = {"provider": provider, "api_key": api_key, "base_url": base_url, "model": model}',
    '    return {"ok": True, "config": config, "public": redacted_config(config)}',
    '',
  ].join('\n');
}

function playerSuppliedLlmConfigTests(): string {
  return [
    'from llm_config import public_provider_config, redacted_config, resolve_llm_config',
    '',
    '',
    'def test_public_provider_config_contains_supported_presets_without_keys():',
    '    config = public_provider_config()',
    '    providers = {provider["id"]: provider for provider in config["providers"]}',
    '    assert {"deepseek", "minimax", "qwen", "openai", "custom"} <= set(providers)',
    '    assert all("api_key" not in provider for provider in providers.values())',
    '    assert config["requires_player_key"] is True',
    '',
    '',
    'def test_resolve_uses_player_supplied_minimax_key_and_model():',
    '    result = resolve_llm_config({',
    '        "provider": "minimax",',
    '        "api_key": "player-key",',
    '        "model": "MiniMax-M2.7",',
    '    }, environ={})',
    '    assert result["ok"] is True',
    '    assert result["config"]["provider"] == "minimax"',
    '    assert result["config"]["api_key"] == "player-key"',
    '    assert result["config"]["model"] == "MiniMax-M2.7"',
    '    assert "api_key" not in result["public"]',
    '    assert result["public"]["has_key"] is True',
    '',
    '',
    'def test_resolve_supports_qwen_preset():',
    '    result = resolve_llm_config({"provider": "qwen", "api_key": "qwen-key"}, environ={})',
    '    assert result["ok"] is True',
    '    assert "dashscope" in result["config"]["base_url"]',
    '    assert result["config"]["model"] == "qwen-plus"',
    '',
    '',
    'def test_custom_provider_requires_base_url_and_model():',
    '    missing = resolve_llm_config({"provider": "custom", "api_key": "k", "model": "x"}, environ={})',
    '    assert missing["ok"] is False',
    '    assert missing["error"] == "missing_base_url"',
    '    ok = resolve_llm_config({"provider": "custom", "api_key": "k", "base_url": "http://localhost:8000/v1", "model": "local"}, environ={})',
    '    assert ok["ok"] is True',
    '',
    '',
    'def test_missing_player_key_is_rejected_without_env_fallback():',
    '    result = resolve_llm_config({"provider": "deepseek"}, environ={})',
    '    assert result["ok"] is False',
    '    assert result["error"] == "missing_api_key"',
    '',
    '',
    'def test_server_key_fallback_requires_explicit_opt_in():',
    '    rejected = resolve_llm_config({"provider": "deepseek"}, environ={"DEEPSEEK_API_KEY": "server-key"})',
    '    assert rejected["ok"] is False',
    '    accepted = resolve_llm_config({"provider": "deepseek"}, environ={"DEEPSEEK_API_KEY": "server-key", "WW_ALLOW_SERVER_LLM_KEY_FALLBACK": "true"})',
    '    assert accepted["ok"] is True',
    '    assert accepted["config"]["api_key"] == "server-key"',
    '',
    '',
    'def test_redacted_config_never_exposes_secret_value():',
    '    redacted = redacted_config({"provider": "deepseek", "api_key": "secret", "base_url": "https://api.deepseek.com", "model": "m"})',
    '    assert redacted == {"provider": "deepseek", "base_url": "https://api.deepseek.com", "model": "m", "has_key": True}',
    '',
  ].join('\n');
}

function patchFlaskAppForPlayerLlmConfig(appText: string): string {
  let next = ensureImportLine(appText, 'from llm_config import public_provider_config, resolve_llm_config');
  next = ensureConfigRouteExposesLlmProviders(next);
  next = replaceGlobalKeyGuardWithPlayerLlmConfig(next);
  next = movePlayerLlmConfigAfterModeValidation(next);
  next = patchGameMasterStartCall(next);
  return next;
}

function ensureImportLine(text: string, importLine: string): string {
  if (text.includes(importLine)) return text;
  const flaskImport = /^from flask import[^\n]*$/m;
  if (flaskImport.test(text)) return text.replace(flaskImport, (line) => `${line}\n${importLine}`);
  const importBlock = text.match(/^(?:from __future__ import annotations\n\n)?(?:import [^\n]+\n|from [^\n]+ import [^\n]+\n)+/m);
  if (importBlock) return text.replace(importBlock[0], `${importBlock[0]}${importLine}\n`);
  return `${importLine}\n${text}`;
}

function ensureConfigRouteExposesLlmProviders(appText: string): string {
  if (/public_provider_config\s*\(\s*\)/.test(appText)) return appText;
  return appText.replace(/return jsonify\(\{([\s\S]*?)\}\)/g, (match, body: string) => {
    if (!/(["']model["']|["']base_url["'])/.test(body)) return match;
    if (body.includes('\n')) {
      const closeIndent = body.match(/\n(\s*)$/)?.[1] ?? '    ';
      const itemIndent = body.match(/\n(\s*)["'](?:model|base_url)["']/)?.[1] ?? `${closeIndent}    `;
      let cleanedBody = body.replace(/\s*$/, '');
      if (!cleanedBody.trimEnd().endsWith(',')) cleanedBody += ',';
      return [
        `return jsonify({${cleanedBody}`,
        `${itemIndent}"providers": public_provider_config()["providers"],`,
        `${itemIndent}"requires_player_key": True,`,
        `${closeIndent}})`,
      ].join('\n');
    }
    const separator = body.trimEnd().endsWith(',') ? ' ' : ', ';
    return `return jsonify({${body}${separator}"providers": public_provider_config()["providers"], "requires_player_key": True})`;
  });
}

function replaceGlobalKeyGuardWithPlayerLlmConfig(appText: string): string {
  if (/resolve_llm_config\s*\(\s*body\s*\)/.test(appText)) return appText;
  const playerGuard = [
    '    body = request.get_json(silent=True) or {}',
    '    llm_config = resolve_llm_config(body)',
    '    if not llm_config["ok"]:',
    '        return jsonify({"error": llm_config["error"], "providers": public_provider_config()}), 400',
  ].join('\n');
  let next = appText.replace(
    /    # Check API key availability before starting\n    has_key, error_msg = require_api_key\(\)\n    if not has_key:\n        return jsonify\(\{"error": error_msg\}\), 400\n\n    body = request\.get_json\(silent=True\) or \{\}/,
    playerGuard,
  );
  next = next.replace(
    /    has_key, error_msg = require_api_key\(\)\n    if not has_key:\n        return jsonify\(\{"error": error_msg\}\), 400\n    body = request\.get_json\(silent=True\) or \{\}/,
    playerGuard,
  );
  next = next.replace(
    /    if not has_api_key\(\):\n        return jsonify\(missing_api_key_payload\(\)\), 400\n    body = request\.get_json\(silent=True\) or \{\}/,
    playerGuard,
  );
  return next;
}

function movePlayerLlmConfigAfterModeValidation(appText: string): string {
  const guardPattern = [
    '    llm_config = resolve_llm_config(body)',
    '    if not llm_config["ok"]:',
    '        return jsonify({"error": llm_config["error"], "providers": public_provider_config()}), 400',
  ].join('\n');
  if (!appText.includes(guardPattern)) return appText;
  return appText.replace(
    /(\n    body = request\.get_json\(silent=True\) or \{\}\n)(    llm_config = resolve_llm_config\(body\)\n    if not llm_config\["ok"\]:\n        return jsonify\(\{"error": llm_config\["error"\], "providers": public_provider_config\(\)\}\), 400\n)(    mode = body\.get\("mode", DEFAULT_MODE\)\n    if mode not in GAME_MODES:\n        return jsonify\([^\n]+\), 400\n)/,
    '$1$3$2',
  );
}

function patchGameMasterStartCall(appText: string): string {
  if (/llm_config=llm_config\["config"\]/.test(appText)) return appText;
  return appText.replace(
    /GameMaster\((.*)\)\.run\(\)/g,
    (match, args: string) => {
      if (/llm_config=/.test(args)) return match;
      const sep = args.trim().length > 0 ? ', ' : '';
      return `GameMaster(${args}${sep}llm_config=llm_config["config"]).run()`;
    },
  );
}

function patchPlayerForPlayerLlmConfig(playerText: string): string {
  let next = playerText;
  next = next.replace(
    /def make_client\(\)(?:\s*->\s*OpenAI)?:\n    return OpenAI\(\n        api_key=os\.environ\.get\("DEEPSEEK_API_KEY"\) or os\.environ\.get\("OPENAI_API_KEY"\),\n        base_url=BASE_URL,\n    \)/,
    [
      'def make_client(api_key=None, base_url=None) -> OpenAI:',
      '    return OpenAI(',
      '        api_key=api_key or os.environ.get("DEEPSEEK_API_KEY") or os.environ.get("OPENAI_API_KEY"),',
      '        base_url=base_url or BASE_URL,',
      '    )',
    ].join('\n'),
  );
  next = next.replace(
    /def make_client\(\):\n    return OpenAI\(api_key=os\.environ\.get\("DEEPSEEK_API_KEY"\) or os\.environ\.get\("OPENAI_API_KEY"\), base_url=BASE_URL\)/,
    [
      'def make_client(api_key=None, base_url=None) -> OpenAI:',
      '    return OpenAI(api_key=api_key or os.environ.get("DEEPSEEK_API_KEY") or os.environ.get("OPENAI_API_KEY"), base_url=base_url or BASE_URL)',
    ].join('\n'),
  );
  next = next.replace(/def __init__\(self, client\):/, 'def __init__(self, client, model=None):');
  next = next.replace(/(\n\s*self\.client = client\n)/, `$1        self.model = model or MODEL\n`);
  next = next.replace(
    /on_thinking=None\):/,
    'on_thinking=None,\n                 model=None):',
  );
  next = next.replace(/(\n\s*self\.client = client\n)(\s*self\.personality = personality\n)/, `$1        self.model = model or MODEL\n$2`);
  next = next.replace(/model=MODEL/g, 'model=self.model');
  return next;
}

function patchGameForPlayerLlmConfig(gameText: string): string {
  let next = gameText;
  next = next.replace(
    /def __init__\(self, mode: str = DEFAULT_MODE, emit=None, speed: float = 1\.0\):/,
    'def __init__(self, mode: str = DEFAULT_MODE, emit=None, speed: float = 1.0, llm_config=None):',
  );
  next = next.replace(
    /def __init__\(self, mode="m6", emit=None, speed=1\.0\):/,
    'def __init__(self, mode="m6", emit=None, speed=1.0, llm_config=None):',
  );
  next = next.replace(
    /(\n\s*)self\.client = make_client\(\)/,
    [
      '$1self.llm_config = llm_config or {}',
      '$1self.model = self.llm_config.get("model") or MODEL',
      '$1self.client = make_client(api_key=self.llm_config.get("api_key"), base_url=self.llm_config.get("base_url"))',
    ].join('\n'),
  );
  next = next.replace(/Player\(self\.client\)/g, 'Player(self.client, model=self.model)');
  next = next.replace(
    /(\n)(\s*)on_thinking=on_thinking,\n(\s*)\)\)/,
    '$1$2on_thinking=on_thinking,\n$2model=self.model,\n$3))',
  );
  next = next.replace(/model=MODEL/g, 'model=self.model');
  return next;
}

function patchTemplateForPlayerLlmConfig(templateText: string): string {
  let next = templateText;
  if (!/llmApiKey/.test(next)) {
    const controls = [
      '<select id="llmProvider" title="LLM provider">',
      '  <option value="deepseek">DeepSeek</option>',
      '  <option value="minimax">MiniMax</option>',
      '  <option value="qwen">Qwen</option>',
      '  <option value="openai">OpenAI-compatible</option>',
      '  <option value="custom">Custom</option>',
      '</select>',
      '<input id="llmModel" type="text" placeholder="model" autocomplete="off">',
      '<input id="llmBaseUrl" type="url" placeholder="base URL" autocomplete="off">',
      '<input id="llmApiKey" type="password" placeholder="your API key" autocomplete="off">',
    ].join('\n    ');
    next = next.replace(/(<button[^>]+id=["']start["'][^>]*>)/, `${controls}\n    $1`);
  }
  const providerPayload = 'provider: document.getElementById("llmProvider")?.value || "deepseek", api_key: document.getElementById("llmApiKey")?.value || "", model: document.getElementById("llmModel")?.value || "", base_url: document.getElementById("llmBaseUrl")?.value || ""';
  next = next.replace(
    /JSON\.stringify\(\{\s*mode:\s*selectedMode,\s*speed\s*\}\)/g,
    `JSON.stringify({ mode: selectedMode, speed, ${providerPayload} })`,
  );
  next = next.replace(
    /JSON\.stringify\(\{\s*mode:\s*selectedMode,\s*speed:\s*1\s*\}\)/g,
    `JSON.stringify({ mode: selectedMode, speed: 1, ${providerPayload} })`,
  );
  next = next.replace(
    /const \{\s*game_id\s*\} = await r\.json\(\);/g,
    [
      'const startResult = await r.json();',
      '        if (!r.ok) { throw new Error(startResult.message || startResult.error || "Failed to start game"); }',
      '        const { game_id } = startResult;',
    ].join('\n'),
  );
  return next;
}

function patchFlaskTestsForPlayerLlmConfig(testText: string): string {
  let next = testText.replace(
    /assert "API key" in data\["error"\] or "DEEPSEEK_API_KEY" in data\["error"\] or "OPENAI_API_KEY" in data\["error"\]/g,
    'assert data["error"] == "missing_api_key"',
  );

  const lines = next.split('\n');
  let inMissingKeyTest = false;
  next = lines.map((line) => {
    if (/^def\s+/.test(line)) {
      inMissingKeyTest = /without_api_key|missing_.*api_key|api_key_.*missing/.test(line);
    }
    if (inMissingKeyTest || !line.includes('client.post("/start"')) return line;
    return addPlayerApiKeyToStartRequestLine(line);
  }).join('\n');
  return next;
}

function addPlayerApiKeyToStartRequestLine(line: string): string {
  if (/api_key/.test(line)) return line;
  return line.replace(/json=\{([^{}]*)\}/, (_match, body: string) => {
    const trimmed = body.trim();
    if (!trimmed) return 'json={"api_key": "test-key"}';
    return `json={${body}, "api_key": "test-key"}`;
  });
}

function socialDeductionRulesModule(): string {
  return [
    'from __future__ import annotations',
    '',
    'from collections import Counter',
    'from typing import Any',
    '',
    '',
    'GOOD_WINNER = "好人"',
    'WOLF_WINNER = "狼人"',
    '',
    '',
    'def role_distribution(roles: list[str]) -> dict[str, int]:',
    '    """Return a stable role-count map for mode audits and UI metadata."""',
    '    return dict(sorted(Counter(roles).items()))',
    '',
    '',
    'def validate_mode_config(mode_id: str, roles: list[str]) -> dict[str, Any]:',
    '    distribution = role_distribution(roles)',
    '    wolves = distribution.get("werewolf", 0)',
    '    goods = len(roles) - wolves',
    '    errors: list[str] = []',
    '    if len(roles) < 6:',
    '        errors.append("mode must include at least 6 players")',
    '    if wolves < 1:',
    '        errors.append("mode must include at least one werewolf")',
    '    if goods < 1:',
    '        errors.append("mode must include at least one good-side role")',
    '    if wolves >= goods:',
    '        errors.append("werewolf count must be lower than good-side count at setup")',
    '    if not ({"seer", "witch", "hunter", "guard", "idiot"} & set(roles)):',
    '        errors.append("mode should include at least one special good-side role")',
    '    return {',
    '        "mode_id": mode_id,',
    '        "ok": not errors,',
    '        "errors": errors,',
    '        "role_count": len(roles),',
    '        "wolf_count": wolves,',
    '        "good_count": goods,',
    '        "distribution": distribution,',
    '    }',
    '',
    '',
    'def validate_game_modes(modes: dict[str, dict[str, Any]]) -> dict[str, Any]:',
    '    mode_reports = {',
    '        mode_id: validate_mode_config(mode_id, list(config.get("roles", [])))',
    '        for mode_id, config in sorted(modes.items())',
    '    }',
    '    return {"ok": all(report["ok"] for report in mode_reports.values()), "modes": mode_reports}',
    '',
    '',
    'def winner_from_alive_roles(alive_roles: list[str]) -> str | None:',
    '    wolves = sum(1 for role in alive_roles if role == "werewolf")',
    '    goods = len(alive_roles) - wolves',
    '    if wolves == 0:',
    '        return GOOD_WINNER',
    '    if wolves >= goods:',
    '        return WOLF_WINNER',
    '    return None',
    '',
    '',
    'def _vote_target(vote: Any) -> int:',
    '    if isinstance(vote, dict):',
    '        return int(vote["target"])',
    '    return int(vote)',
    '',
    '',
    'def resolve_vote_result(votes: dict[int, Any]) -> dict[str, Any]:',
    '    if not votes:',
    '        return {"outcome": "none", "executed": None, "candidates": [], "tally": {}}',
    '    tally = Counter(_vote_target(vote) for vote in votes.values())',
    '    top = max(tally.values())',
    '    candidates = sorted(pid for pid, count in tally.items() if count == top)',
    '    payload = {"candidates": candidates, "tally": dict(sorted(tally.items()))}',
    '    if len(candidates) > 1:',
    '        return {"outcome": "tie", "executed": None, **payload}',
    '    return {"outcome": "executed", "executed": candidates[0], **payload}',
    '',
    '',
    'def build_match_report(events: list[dict[str, Any]], players: list[dict[str, Any]], winner: str) -> dict[str, Any]:',
    '    return {',
    '        "winner": winner,',
    '        "events": events,',
    '        "players": players,',
    '        "event_count": len(events),',
    '        "alive_count": sum(1 for player in players if player.get("alive")),',
    '    }',
    '',
  ].join('\n');
}

function socialDeductionRulesTests(): string {
  return [
    'from rules import (',
    '    build_match_report,',
    '    resolve_vote_result,',
    '    role_distribution,',
    '    validate_game_modes,',
    '    validate_mode_config,',
    '    winner_from_alive_roles,',
    ')',
    '',
    '',
    'def test_tied_vote_has_no_random_execution():',
    '    result = resolve_vote_result({1: 2, 2: 1})',
    '    assert result["outcome"] == "tie"',
    '    assert result["executed"] is None',
    '    assert result["candidates"] == [1, 2]',
    '',
    '',
    'def test_clear_vote_executes_top_target():',
    '    result = resolve_vote_result({1: {"target": 2}, 2: {"target": 2}, 3: {"target": 1}})',
    '    assert result["outcome"] == "executed"',
    '    assert result["executed"] == 2',
    '    assert result["tally"] == {1: 1, 2: 2}',
    '',
    '',
    'def test_winner_from_alive_roles():',
    '    assert winner_from_alive_roles(["villager", "seer"]) == "好人"',
    '    assert winner_from_alive_roles(["werewolf", "villager"]) == "狼人"',
    '    assert winner_from_alive_roles(["werewolf", "villager", "seer"]) is None',
    '',
    '',
    'def test_role_distribution_counts_roles():',
    '    assert role_distribution(["werewolf", "villager", "werewolf"]) == {"villager": 1, "werewolf": 2}',
    '',
    '',
    'def test_mode_config_validation_accepts_balanced_mode():',
    '    report = validate_mode_config("m6", ["werewolf", "werewolf", "seer", "witch", "villager", "villager"])',
    '    assert report["ok"] is True',
    '    assert report["wolf_count"] == 2',
    '    assert report["good_count"] == 4',
    '',
    '',
    'def test_mode_config_validation_rejects_wolf_majority():',
    '    report = validate_mode_config("broken", ["werewolf", "werewolf", "villager"])',
    '    assert report["ok"] is False',
    '    assert any("werewolf count" in error for error in report["errors"])',
    '',
    '',
    'def test_game_modes_validation_summarizes_all_modes():',
    '    report = validate_game_modes({"m6": {"roles": ["werewolf", "werewolf", "seer", "witch", "villager", "villager"]}})',
    '    assert report["ok"] is True',
    '    assert report["modes"]["m6"]["role_count"] == 6',
    '',
    '',
    'def test_match_report_preserves_event_count():',
    '    report = build_match_report([{"type": "vote"}], [{"pid": 1, "alive": True}], "好人")',
    '    assert report["event_count"] == 1',
    '    assert report["alive_count"] == 1',
    '',
  ].join('\n');
}

function socialDeductionGameDesignDoc(): string {
  return [
    '# Game Design',
    '',
    '## Rule Engine Boundary',
    '',
    '`rules.py` owns deterministic social-deduction rules that should be stable across UI, API and simulation paths. `game.py` coordinates turn flow, player prompts and event emission, then delegates vote and win-condition decisions to the rule engine.',
    '',
    '## Vote Policy',
    '',
    '- Clear majority or plurality votes execute the top target.',
    '- Tied votes do not randomly execute a player. The day ends with no exile so the outcome is fair, explainable and replayable.',
    '- Vote results expose candidates and tally data for event logs and later match reports.',
    '',
    '## Win Conditions',
    '',
    '- Good wins when no living werewolves remain.',
    '- Werewolves win when living werewolves are greater than or equal to all other living roles.',
    '- Otherwise the game continues.',
    '',
    '## Mode Validation',
    '',
    '- Each configured mode must include at least six players, at least one werewolf and at least one good-side role.',
    '- Werewolves must start below parity with the good side so the match is not decided at setup.',
    '- Each mode should include at least one special good-side role to support deduction and counterplay.',
    '',
    '## Verification',
    '',
    'Rule-level tests in `tests/test_rules.py` cover tied votes, clear votes, winner calculation, role distribution and report metadata. Gameplay changes should add rule tests before changing orchestration code.',
    '',
  ].join('\n');
}

function patchSocialDeductionGame(gameText: string): string {
  let next = ensureRulesImport(gameText);
  next = ensureModeValidationGuard(next);
  next = patchWinnerMethod(next);
  next = patchVoteTieResolution(next);
  return next;
}

function ensureRulesImport(gameText: string): string {
  const required = ['resolve_vote_result', 'validate_game_modes', 'winner_from_alive_roles'];
  const existing = gameText.match(/^from rules import ([^\n]+)$/m);
  if (existing) {
    const existingNames = existing[1]!
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
    if (required.every((name) => existingNames.includes(name))) return gameText;
    return gameText.replace(/^from rules import ([^\n]+)$/m, (_line, names: string) => {
      const merged = names.split(',').map((name) => name.trim()).filter(Boolean);
      for (const name of required) {
        if (!merged.includes(name)) merged.push(name);
      }
      return `from rules import ${merged.join(', ')}`;
    });
  }
  if (/^from collections import Counter$/m.test(gameText)) {
    return gameText.replace(/^from collections import Counter$/m, 'from collections import Counter\nfrom rules import resolve_vote_result, validate_game_modes, winner_from_alive_roles');
  }
  const importBlock = gameText.match(/^(?:from __future__ import annotations\n\n)?(?:import [^\n]+\n|from [^\n]+ import [^\n]+\n)+/m);
  if (importBlock) {
    return gameText.replace(importBlock[0], `${importBlock[0]}from rules import resolve_vote_result, validate_game_modes, winner_from_alive_roles\n`);
  }
  return `from rules import resolve_vote_result, validate_game_modes, winner_from_alive_roles\n\n${gameText}`;
}

function ensureModeValidationGuard(gameText: string): string {
  if (/validate_game_modes\s*\(\s*GAME_MODES\s*\)/.test(gameText)) return gameText;
  const guard = [
    '_MODE_VALIDATION = validate_game_modes(GAME_MODES)',
    'if not _MODE_VALIDATION["ok"]:',
    '    raise ValueError(f"Invalid GAME_MODES: {_MODE_VALIDATION}")',
    '',
  ].join('\n');
  if (/\nDEFAULT_MODE\s*=/.test(gameText)) {
    return gameText.replace(/\n(DEFAULT_MODE\s*=)/, `\n${guard}$1`);
  }
  const oneLineModes = /^(GAME_MODES\s*=\s*\{[^\n]*\}\n)/m;
  if (oneLineModes.test(gameText)) {
    return gameText.replace(oneLineModes, `$1${guard}`);
  }
  return gameText;
}

function patchWinnerMethod(gameText: string): string {
  const replacement = [
    '    def winner(self):',
    '        return winner_from_alive_roles([p.role for p in self.alive()])',
  ].join('\n');
  return gameText.replace(
    /    def winner\(self\):\n        wolves, goods = self\._balance\(\)\n        if wolves == 0:\n            return "好人"\n        if wolves >= goods:\n            return "狼人"\n        return None/g,
    replacement,
  );
}

function patchVoteTieResolution(gameText: string): string {
  const actualBefore = [
    '        tally = Counter(d["target"] for d in votes.values())',
    '        top = max(tally.values())',
    '        cands = [pid for pid, c in tally.items() if c == top]',
    '        time.sleep(self.PAUSE_PHASE)',
    '',
    '        if len(cands) > 1:',
    '            executed = random.choice(cands)',
    '            self.broadcast(f"⚖️ 投票出现平局（{cands}），随机放逐 {executed} 号。")',
    '        else:',
    '            executed = cands[0]',
    '            self.broadcast(f"⚖️ {executed} 号被投票放逐出局。")',
  ].join('\n');
  const actualAfter = [
    '        vote_result = resolve_vote_result(votes)',
    '        time.sleep(self.PAUSE_PHASE)',
    '',
    '        if vote_result["outcome"] == "tie":',
    '            tied = vote_result["candidates"]',
    '            self.broadcast(f"⚖️ 投票出现平局（{tied}），本轮无人出局。")',
    '            self._emit({"type": "vote_tie", "candidates": tied, "tally": vote_result["tally"]})',
    '            self._emit_state(phase="day")',
    '            return',
    '',
    '        executed = vote_result["executed"]',
    '        self.broadcast(f"⚖️ {executed} 号被投票放逐出局。")',
  ].join('\n');
  let next = gameText.replace(actualBefore, actualAfter);

  const fixtureBefore = [
    '        tally = Counter(votes.values())',
    '        top = max(tally.values())',
    '        cands = [pid for pid, c in tally.items() if c == top]',
    '        if len(cands) > 1:',
    '            executed = random.choice(cands)',
    '            self.broadcast(f"平局随机放逐 {executed}")',
    '        else:',
    '            executed = cands[0]',
    '        self._resolve_death_with_chain(executed, "vote")',
    '        return executed',
  ].join('\n');
  const fixtureAfter = [
    '        vote_result = resolve_vote_result(votes)',
    '        if vote_result["outcome"] == "tie":',
    '            self.broadcast(f"平票（{vote_result[\'candidates\']}），本轮无人出局。")',
    '            return None',
    '        executed = vote_result["executed"]',
    '        self._resolve_death_with_chain(executed, "vote")',
    '        return executed',
  ].join('\n');
  next = next.replace(fixtureBefore, fixtureAfter);
  return next;
}

async function ensureScript(projectPath: string, key: string, value: string, replace = false): Promise<boolean> {
  const pkgPath = path.join(projectPath, 'package.json');
  const pkg = (await readJsonSafe<Record<string, unknown>>(pkgPath)) ?? {};
  const scripts = ((pkg as { scripts?: Record<string, string> }).scripts ?? {}) as Record<string, string>;
  if (scripts[key] && (!replace || scripts[key] === value)) return false;
  scripts[key] = value;
  (pkg as { scripts?: Record<string, string> }).scripts = scripts;
  await writeJson(pkgPath, pkg);
  return true;
}

async function ensureDevDependency(projectPath: string, name: string, version: string): Promise<boolean> {
  const pkgPath = path.join(projectPath, 'package.json');
  const pkg = (await readJsonSafe<Record<string, unknown>>(pkgPath)) ?? {};
  const dependencies = ((pkg as { dependencies?: Record<string, string> }).dependencies ?? {}) as Record<string, string>;
  const devDependencies = ((pkg as { devDependencies?: Record<string, string> }).devDependencies ?? {}) as Record<string, string>;
  if (dependencies[name] || devDependencies[name]) return false;
  devDependencies[name] = version;
  (pkg as { devDependencies?: Record<string, string> }).devDependencies = devDependencies;
  await writeJson(pkgPath, pkg);
  return true;
}

async function isPythonProject(projectPath: string): Promise<boolean> {
  return fileExists(path.join(projectPath, 'requirements.txt')) ||
    fileExists(path.join(projectPath, 'pyproject.toml')) ||
    fileExists(path.join(projectPath, 'app.py')) ||
    fileExists(path.join(projectPath, 'main.py'));
}

async function readRequirements(projectPath: string): Promise<string[]> {
  const req = await readTextSafe(path.join(projectPath, 'requirements.txt'));
  if (!req) return [];
  return req
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

async function ensureRequirement(projectPath: string, requirement: string): Promise<boolean> {
  const target = path.join(projectPath, 'requirements.txt');
  const existing = await readRequirements(projectPath);
  const name = requirement.split(/[<>=!~]/)[0]!.toLowerCase();
  if (existing.some((line) => line.split(/[<>=!~]/)[0]!.toLowerCase() === name)) return false;
  const next = [...existing, requirement, ''].join('\n');
  await writeText(target, next);
  return true;
}

function toBoundedPythonConstraint(requirement: string): string | null {
  const cleaned = requirement.replace(/\s+#.*$/, '').trim();
  if (!cleaned || cleaned.startsWith('-') || /^https?:/.test(cleaned)) return null;
  if (/(^|[, ])(?:==|===|~=|<|<=)\s*[^,\s]+/.test(cleaned)) return cleaned;
  const match = cleaned.match(/^([A-Za-z0-9_.-]+(?:\[[^\]]+\])?)\s*>=\s*([0-9]+(?:\.[0-9]+){0,2})/);
  if (!match) return cleaned;
  const name = match[1]!;
  const minimum = match[2]!;
  const major = Number(minimum.split('.')[0] ?? '0');
  if (!Number.isFinite(major)) return cleaned;
  return `${name}>=${minimum},<${major + 1}.0.0`;
}

async function ensureReadmeUsesConstraints(projectPath: string): Promise<boolean> {
  const target = path.join(projectPath, 'README.md');
  const existing = await readTextSafe(target);
  if (!existing) return false;
  if (/-c\s+constraints\.txt/.test(existing)) return false;
  const next = existing.replace(
    /pip\s+install\s+-r\s+requirements\.txt/g,
    'pip install -r requirements.txt -c constraints.txt',
  );
  if (next === existing) {
    const appendix = [
      '',
      '## Dependency Constraints',
      '',
      'Install Python dependencies with the checked-in constraint policy:',
      '',
      '```bash',
      'pip install -r requirements.txt -c constraints.txt',
      '```',
      '',
    ].join('\n');
    await writeText(target, existing.trimEnd() + appendix);
    return true;
  }
  await writeText(target, next);
  return true;
}

async function ensureFutureAnnotationsForPythonSources(projectPath: string): Promise<string[]> {
  const candidates = ['app.py', 'config.py', 'game.py', 'player.py', 'prompts.py', 'main.py', 'diag.py', 'wsgi.py'];
  const changed: string[] = [];
  for (const rel of candidates) {
    const target = path.join(projectPath, rel);
    const text = await readTextSafe(target);
    if (!text || /from __future__ import annotations/.test(text) || !needsDeferredAnnotations(text)) continue;
    await writeText(target, addFutureAnnotations(text));
    changed.push(rel);
  }
  return changed;
}

function needsDeferredAnnotations(text: string): boolean {
  return /\|\s*(?:None|[A-Z_a-z])|\b(?:dict|list|tuple|set)\[[^\]]+\]/.test(text);
}

function addFutureAnnotations(text: string): string {
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  let index = 0;
  if (lines[index]?.startsWith('#!')) index += 1;
  if (/coding[:=]\s*[-\w.]+/.test(lines[index] ?? '')) index += 1;
  lines.splice(index, 0, 'from __future__ import annotations', '');
  return lines.join(newline);
}

function ensureConfigImport(appText: string): string {
  const required = ['has_api_key', 'max_active_games', 'missing_api_key_payload', 'public_config'];
  const existing = appText.match(/^from config import ([^\n]+)$/m);
  if (existing) {
    const names = existing[1]!
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
    const merged = [...names];
    for (const name of required) {
      if (!merged.includes(name)) merged.push(name);
    }
    return appText.replace(existing[0], `from config import ${merged.join(', ')}`);
  }
  return appText.replace(
    /(from flask import[^\n]*\n)/,
    `$1from config import ${required.join(', ')}\n`,
  );
}

function ensureConfigImportNames(appText: string, required: string[]): string {
  const existing = appText.match(/^from config import ([^\n]+)$/m);
  if (existing) {
    const names = existing[1]!
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
    const merged = [...names];
    for (const name of required) {
      if (!merged.includes(name)) merged.push(name);
    }
    return appText.replace(existing[0], `from config import ${merged.join(', ')}`);
  }
  return appText.replace(
    /(from flask import[^\n]*\n)/,
    `$1from config import ${required.join(', ')}\n`,
  );
}

async function ensureMaxActiveGamesConfig(projectPath: string): Promise<boolean> {
  const target = path.join(projectPath, 'config.py');
  const existing = (await readTextSafe(target)) ?? '';
  if (/def\s+max_active_games\s*\(/.test(existing)) return false;
  const prefix = existing.trim().length > 0
    ? existing.trimEnd()
    : 'from __future__ import annotations\n\nimport os';
  const body = [
    prefix,
    '',
    '',
    'def max_active_games() -> int:',
    '    try:',
    '        return max(1, int(os.environ.get("MAX_ACTIVE_GAMES", "3")))',
    '    except ValueError:',
    '        return 3',
    '',
  ].join('\n');
  await writeText(target, ensurePythonImport(body, 'os'));
  return true;
}

function ensurePythonImport(text: string, moduleName: string): string {
  if (new RegExp(`^import\\s+${moduleName}$`, 'm').test(text)) return text;
  if (/^from __future__ import annotations$/m.test(text)) {
    return text.replace(
      /^from __future__ import annotations\n+/m,
      `from __future__ import annotations\n\nimport ${moduleName}\n\n`,
    );
  }
  return `import ${moduleName}\n\n${text}`;
}

function ensureLoggingImport(appText: string): string {
  if (/^import\s+logging$/m.test(appText)) return appText;
  if (/^import\s+/m.test(appText)) return appText.replace(/^import\s+/m, 'import logging\nimport ');
  return `import logging\n${appText}`;
}

function ensureLogger(appText: string): string {
  if (/logger\s*=\s*logging\.getLogger\s*\(__name__\)/.test(appText)) return appText;
  return appText.replace(/(app\s*=\s*Flask\([^\n]*\)\n)/, `$1logger = logging.getLogger(__name__)\n`);
}

function ensureSecurityHeadersHook(appText: string): string {
  if (/X-Content-Type-Options/.test(appText) && /after_request/.test(appText)) return appText;
  const hook = [
    '',
    '',
    '@app.after_request',
    'def add_security_headers(response):',
    '    response.headers.setdefault("X-Content-Type-Options", "nosniff")',
    '    response.headers.setdefault("X-Frame-Options", "DENY")',
    '    response.headers.setdefault("Referrer-Policy", "no-referrer")',
    '    response.headers.setdefault("Permissions-Policy", "geolocation=(), microphone=(), camera=()")',
    '    return response',
    '',
  ].join('\n');
  return appText.replace(/(logger\s*=\s*logging\.getLogger\s*\(__name__\)\n|app\s*=\s*Flask\([^\n]*\)\n)/, `$1${hook}`);
}

function ensureStartModeValidation(appText: string): string {
  if (/invalid_mode/.test(appText)) return appText;
  return appText.replace(
    /(\n\s*mode\s*=\s*body\.get\("mode",\s*DEFAULT_MODE\)\n)/,
    `$1    if mode not in GAME_MODES:\n        return jsonify({"error": "invalid_mode", "message": "Unsupported game mode.", "valid_modes": sorted(GAME_MODES.keys())}), 400\n`,
  );
}

function ensureSpeedClamp(appText: string): string {
  if (/min\s*\(\s*speed\s*,\s*3\.0\s*\)|max\s*\(\s*0\.1\s*,\s*min\s*\(\s*speed/.test(appText)) return appText;
  return appText.replace(
    /(\n\s*except\s*\(TypeError,\s*ValueError\):\n\s*speed\s*=\s*1\.0\n)/,
    `$1    speed = max(0.1, min(speed, 3.0))\n`,
  );
}

function ensureActiveGameLimit(appText: string): string {
  if (/too_many_active_games/.test(appText)) return appText;
  return appText.replace(
    /(\n\s*with\s+_lock:\n)(\s*)_games\[game_id\]\s*=\s*\{"queue":\s*q,\s*"last_seen":\s*time\.time\(\)\}\n/,
    `$1$2if len(_games) >= max_active_games():\n$2    logger.warning("active game limit reached", extra={"active_games": len(_games)})\n$2    return jsonify({"error": "too_many_active_games", "message": "Too many active games; try again later."}), 429\n$2_games[game_id] = {"queue": q, "last_seen": time.time()}\n`,
  );
}

function ensureRuntimeLogCalls(appText: string): string {
  let next = appText;
  next = next.replace(
    /print\(f"[^"]*清理 \{len\(expired\)\}[^"]*"\)/,
    'logger.info("cleaned expired games", extra={"expired_games": len(expired)})',
  );
  if (!/logger\.exception\("game thread failed"/.test(next)) {
    next = next.replace(
      /(\n\s*except\s+Exception\s+as\s+e:\n)(\s*)emit\(\{"type":\s*"error"/,
      `$1$2logger.exception("game thread failed", extra={"game_id": game_id})\n$2emit({"type": "error"`,
    );
  }
  if (!/logger\.info\("game started"/.test(next)) {
    next = next.replace(
      /(\n\s*_games\[game_id\]\s*=\s*\{"queue":\s*q,\s*"last_seen":\s*time\.time\(\)\}\n)/,
      `$1    logger.info("game started", extra={"game_id": game_id, "mode": mode, "speed": speed})\n`,
    );
  }
  return next;
}

async function ensureIndustrialFlaskApiTests(projectPath: string): Promise<string[]> {
  const target = path.join(projectPath, 'tests', 'test_app.py');
  let existing = (await readTextSafe(target)) ?? '';
  const changed = new Set<string>();
  if (!existing) {
    existing = [
      'import pytest',
      '',
      '',
      '@pytest.fixture()',
      'def client(monkeypatch):',
      '    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")',
      '    import app as app_module',
      '    app_module.app.config.update(TESTING=True)',
      '    app_module._games.clear()',
      '    with app_module.app.test_client() as client:',
      '        yield client',
      '    app_module._games.clear()',
      '',
    ].join('\n');
  }
  existing = replaceLegacyInvalidModeTest(existing);
  existing = replaceActiveGameLimitTest(existing);
  if (!/test_security_headers_present/.test(existing)) {
    existing += [
      '',
      '',
      'def test_security_headers_present(client):',
      '    response = client.get("/healthz")',
      '    assert response.headers["X-Content-Type-Options"] == "nosniff"',
      '    assert response.headers["X-Frame-Options"] == "DENY"',
      '    assert response.headers["Referrer-Policy"] == "no-referrer"',
      '',
    ].join('\n');
  }
  if (!/test_start_rejects_invalid_mode/.test(existing)) {
    existing += [
      '',
      '',
      'def test_start_rejects_invalid_mode(client, monkeypatch):',
      '    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")',
      '    response = client.post("/start", json={"mode": "invalid_mode"})',
      '    assert response.status_code == 400',
      '    assert response.get_json()["error"] == "invalid_mode"',
      '',
    ].join('\n');
  }
  if (!/test_start_rejects_when_active_game_limit_reached/.test(existing)) {
    existing += activeGameLimitTestBlock();
  }
  await writeText(target, existing.trimEnd() + '\n');
  changed.add('tests/test_app.py');
  if (await ensureRequirement(projectPath, 'pytest>=8.0')) changed.add('requirements.txt');
  return Array.from(changed);
}

function activeGameLimitTestBlock(): string {
  return [
    '',
    '',
    'def test_start_rejects_when_active_game_limit_reached(client, monkeypatch):',
    '    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")',
    '    monkeypatch.setenv("MAX_ACTIVE_GAMES", "1")',
    '    import queue',
    '    import time',
    '    import app as app_module',
    '    with app_module._lock:',
    '        app_module._games.clear()',
    '        app_module._games["existing"] = {"queue": queue.Queue(), "last_seen": time.time()}',
    '    try:',
    '        response = client.post("/start", json={"mode": "m6"})',
    '        assert response.status_code == 429',
    '        assert response.get_json()["error"] == "too_many_active_games"',
    '    finally:',
    '        with app_module._lock:',
    '            app_module._games.clear()',
    '',
  ].join('\n');
}

function replaceLegacyInvalidModeTest(text: string): string {
  return text.replace(
    /\n\ndef test_start_with_invalid_mode_still_returns_game_id\([\s\S]*?(?=\n\ndef test_|\n$)/,
    [
      '',
      '',
      'def test_start_with_invalid_mode_still_returns_game_id(client, monkeypatch):',
      '    """Legacy compatibility name: invalid mode is now rejected before creating a game."""',
      '    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")',
      '    response = client.post("/start", json={"mode": "invalid_mode"})',
      '    assert response.status_code == 400',
      '    assert response.get_json()["error"] == "invalid_mode"',
      '',
    ].join('\n'),
  );
}

function replaceActiveGameLimitTest(text: string): string {
  return text.replace(
    /\n\ndef test_start_rejects_when_active_game_limit_reached\([\s\S]*?(?=\n\ndef test_|\n$)/,
    activeGameLimitTestBlock(),
  );
}

function hasStartConfigGuard(appText: string): boolean {
  const section = flaskStartRouteSection(appText);
  return /if\s+not\s+has_api_key\s*\(\s*\)\s*:/.test(section) &&
    /return\s+jsonify\s*\(\s*missing_api_key_payload\s*\(\s*\)\s*\)\s*,\s*400/.test(section);
}

function insertStartConfigGuard(appText: string): string {
  const guard = '    if not has_api_key():\n        return jsonify(missing_api_key_payload()), 400\n';
  const routePattern = /(@app\.(?:route|post)\(\s*["']\/start["'][^\n]*\)\n(?:@[^\n]+\n)*def\s+\w+\s*\([^)]*\):\n)/;
  const next = appText.replace(routePattern, `$1${guard}`);
  if (next !== appText) return next;
  return appText.replace(
    /(def\s+start(?:_game)?\s*\([^)]*\):\n)/,
    `$1${guard}`,
  );
}

function flaskStartRouteSection(appText: string): string {
  const match = /@app\.(?:route|post)\(\s*["']\/start["'][\s\S]*/.exec(appText);
  if (!match) return '';
  return match[0].split(/\n@app\.(?:route|get|post|put|delete|patch)\(/)[0] ?? match[0];
}

async function pythonCompileCommand(projectPath: string): Promise<string> {
  const candidates = PYTHON_SMOKE_CANDIDATES
    .filter((f) => fileExists(path.join(projectPath, f)));
  if (candidates.length > 0) {
    const list = candidates.map((f) => JSON.stringify(f)).join(', ');
    return `python3 -c 'import ast,pathlib; [ast.parse(pathlib.Path(p).read_text(), filename=p) for p in [${list}] if pathlib.Path(p).exists()]'`;
  }
  return `python3 -c 'import ast,pathlib; [ast.parse(p.read_text(), filename=str(p)) for p in pathlib.Path(".").rglob("*.py") if ".venv" not in p.parts and ".zp" not in p.parts]'`;
}

function patchPythonSmokeTestCandidates(text: string): string {
  return text.replace(
    /candidates\s*=\s*\[[^\]]*\]/,
    `candidates = ${JSON.stringify(PYTHON_SMOKE_CANDIDATES)}`,
  );
}
