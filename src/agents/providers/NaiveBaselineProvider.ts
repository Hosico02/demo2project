import path from 'node:path';
import type { AgentTask, AgentResult } from '../../core/types.js';
import type { AgentProvider, AgentContext } from './AgentProvider.js';
import { readJsonSafe, writeJson } from '../../utils/json.js';
import { writeText, readTextSafe, fileExists } from '../../utils/fs.js';

/**
 * NaiveBaselineProvider — Phase 3 A/B baseline.
 *
 * Simulates a "naive Claude CLI session" that:
 *   - writes the files it's asked to write
 *   - DOES NOT run verification commands
 *   - INVENTS optimistic README claims (so docs-truth flags them later)
 *   - DOES NOT learn from failures across runs
 *
 * This is the fair benchmark counterpart to RuleBasedExecutor. Both produce
 * roughly the same file footprint; the difference is that Demo2Project's
 * disciplined loop verifies, gates, and records — while this baseline just
 * shovels files and stops.
 *
 * IMPORTANT: this provider is deterministic. It does not call an LLM. The
 * point of A/B is to isolate the *control loop*, not the model.
 */
export class NaiveBaselineProvider implements AgentProvider {
  readonly name = 'naive-baseline';

  async runTask(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
    const project = path.resolve(ctx.project_path);
    const result: AgentResult = {
      task_id: task.id,
      agent: 'executor',
      status: 'completed',
      summary: `[naive-baseline] handled "${task.title}"`,
      changed_files: [],
      commands_run: [], // <-- deliberately empty: this is the trap
      verification_evidence: [],
      failures: [],
      risks: [],
      next_steps: [],
    };

    // Pick a "naive" handler — produces some artifact, doesn't verify.
    if (/readme/i.test(task.title) || task.expected_changed_files.includes('README.md')) {
      await writeOverclaimingReadme(project);
      result.changed_files.push('README.md');
    } else if (/env\.example/i.test(task.title) || task.expected_changed_files.includes('.env.example')) {
      await writeText(path.join(project, '.env.example'), 'NODE_ENV=development\n');
      result.changed_files.push('.env.example');
    } else if (/gitignore/i.test(task.title) || task.expected_changed_files.includes('.gitignore')) {
      if (!fileExists(path.join(project, '.gitignore'))) {
        await writeText(path.join(project, '.gitignore'), 'node_modules/\n');
        result.changed_files.push('.gitignore');
      }
    } else if (/ci/i.test(task.title)) {
      await writeText(
        path.join(project, '.github', 'workflows', 'ci.yml'),
        'name: CI\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo "fake"\n',
      );
      result.changed_files.push('.github/workflows/ci.yml');
    } else if (/test suite|test script/i.test(task.title)) {
      // The naive trap: claim there are tests in the README but do NOT
      // actually wire them up.
      await writeText(
        path.join(project, 'tests', 'PLACEHOLDER.md'),
        '# tests (not yet implemented)\n',
      );
      result.changed_files.push('tests/PLACEHOLDER.md');
    } else if (/build script/i.test(task.title)) {
      // pretend by adding a build script but leave it broken
      const pkgPath = path.join(project, 'package.json');
      const pkg = (await readJsonSafe<Record<string, unknown>>(pkgPath)) ?? {};
      const scripts = ((pkg as { scripts?: Record<string, string> }).scripts ?? {}) as Record<string, string>;
      if (!scripts.build) {
        scripts.build = 'exit 1'; // intentionally broken
        (pkg as { scripts?: Record<string, string> }).scripts = scripts;
        await writeJson(pkgPath, pkg);
        result.changed_files.push('package.json');
      }
    } else {
      // unrecognized → no-op completed (also a trap pattern in real models)
      result.summary += ' (no-op)';
    }

    // NB: no verification_evidence, no commands_run, no unable_to_verify_reason.
    // Demo2Project's ExecutorAgent will downgrade this to "failed" — but a
    // pure baseline loop (BaselineRunner.run) skips that gate entirely.
    return result;
  }
}

async function writeOverclaimingReadme(project: string): Promise<void> {
  const target = path.join(project, 'README.md');
  if (fileExists(target)) {
    const existing = (await readTextSafe(target)) ?? '';
    if (existing.length > 600) return;
  }
  // README that lies about npm test / docker / CI — Demo2Project's docs:truth
  // will catch these; a naive baseline never checks.
  const body = [
    '# project',
    '',
    'A great project.',
    '',
    '## Install',
    '',
    '```bash',
    'npm install',
    '```',
    '',
    '## Usage',
    '',
    '```bash',
    'npm test          # runs the test suite',
    'npm run build     # builds the project',
    'docker build .    # build the container',
    'docker run myapp  # run it',
    '```',
    '',
    '## CI',
    '',
    'CI runs automatically via GitHub Actions on every push.',
    '',
    '## Configuration',
    '',
    'Copy `.env.example` to `.env`.',
    '',
  ].join('\n');
  await writeText(target, body);
}
