import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { SupervisorAgent } from '../src/agents/SupervisorAgent.js';
import { RuleBasedExecutor } from '../src/agents/providers/RuleBasedExecutor.js';

const execFileAsync = promisify(execFile);
const sourceFixture = path.resolve(process.cwd(), '..', 'werewolf-demo');
const excludedNames = new Set(['.git', '.venv', '__pycache__', '.demo2project', '.pytest_cache']);
const integrationIt = sourceFixtureLooksLikeWerewolf() ? it : it.skip;

function sourceFixtureLooksLikeWerewolf(): boolean {
  if (!existsSync(sourceFixture)) return false;
  try {
    const readme = readFileSync(path.join(sourceFixture, 'README.md'), 'utf8');
    const prompts = readFileSync(path.join(sourceFixture, 'prompts.py'), 'utf8');
    return /werewolf|狼人杀|狼人/i.test(`${readme}\n${prompts}`) && !/chess analysis assistant/i.test(prompts);
  } catch {
    return false;
  }
}

async function copyWerewolfFixture(): Promise<string> {
  const target = await fs.mkdtemp(path.join(tmpdir(), 'd2p-evolith-werewolf-'));
  await fs.cp(sourceFixture, target, {
    recursive: true,
    filter: (src) => !excludedNames.has(path.basename(src)),
  });
  return target;
}

async function runPytest(projectPath: string): Promise<void> {
  await execFileAsync('python3', ['-m', 'pytest', '-q'], {
    cwd: projectPath,
    timeout: 120_000,
    maxBuffer: 1024 * 1024,
  });
}

describe('EvolithAI werewolf demo integration', () => {
  integrationIt(
    'projectizes the sibling werewolf demo with deterministic execution',
    async () => {
      const projectPath = await copyWerewolfFixture();

      try {
        const summaries = await new SupervisorAgent().iterate({
          projectPath,
          goal: 'Projectize the EvolithAI werewolf Flask demo without using LLM APIs',
          provider: new RuleBasedExecutor(),
          maxIterations: 8,
          parallelism: 1,
        });

        expect(summaries.length).toBeGreaterThan(0);
        const allResults = summaries.flatMap((s) => s.executor_results);
        if (allResults.length === 0) {
          expect(summaries[0]!.gap_report.findings).toEqual([]);
        } else {
          expect(allResults.some((r) => r.status === 'completed')).toBe(true);
        }
        const duplicateTaskTitles = summaries.flatMap((summary) => {
          const counts = new Map<string, number>();
          for (const task of summary.assigned_tasks) counts.set(task.title, (counts.get(task.title) ?? 0) + 1);
          return Array.from(counts.entries())
            .filter(([, count]) => count > 1)
            .map(([title]) => title);
        });
        expect(duplicateTaskTitles).toEqual([]);
        const skippedCriticalTasks = summaries.flatMap((summary) =>
          summary.executor_results
            .filter((result) => result.status === 'skipped')
            .map((result) => summary.assigned_tasks.find((task) => task.id === result.task_id))
            .filter((task) => task && (task.priority === 'high' || task.priority === 'blocker'))
            .map((task) => task!.title),
        );
        expect(skippedCriticalTasks).toEqual([]);
        const failedCriticalTasks = summaries.flatMap((summary) =>
          summary.executor_results
            .filter((result) => result.status === 'failed')
            .map((result) => summary.assigned_tasks.find((task) => task.id === result.task_id))
            .filter((task) => task && (task.priority === 'high' || task.priority === 'blocker'))
            .map((task) => task!.title),
        );
        expect(failedCriticalTasks).toEqual([]);

        const packageJsonPath = path.join(projectPath, 'package.json');
        if (existsSync(packageJsonPath)) {
          const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8')) as {
            scripts?: Record<string, string>;
          };
          expect(packageJson.scripts?.test).toBe('python3 -m pytest -q');
          expect(packageJson.scripts?.build).toContain('ast.parse');
        } else {
          const pyproject = await fs.readFile(path.join(projectPath, 'pyproject.toml'), 'utf8');
          const requirements = await fs.readFile(path.join(projectPath, 'requirements.txt'), 'utf8');
          expect(pyproject).toContain('[project]');
          expect(requirements).toContain('pytest');
        }

        await expect(fs.stat(path.join(projectPath, 'tests', 'test_app.py'))).resolves.toBeTruthy();
        await expect(fs.stat(path.join(projectPath, 'config.py'))).resolves.toBeTruthy();

        const appPy = await fs.readFile(path.join(projectPath, 'app.py'), 'utf8');
        expect(appPy).toContain('/healthz');
        expect(appPy).toMatch(/has_api_key|require_api_key/);
        expect(appPy).toContain('return jsonify');
        expect(appPy).toContain('400');

        await runPytest(projectPath);
      } finally {
        await fs.rm(projectPath, { recursive: true, force: true });
      }
    },
    180_000,
  );
});
