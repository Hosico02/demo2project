import path from 'node:path';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import { MockAgentProvider } from '../../agents/providers/MockAgentProvider.js';
import { LocalCommandProvider } from '../../agents/providers/LocalCommandProvider.js';
import { RuleBasedExecutor } from '../../agents/providers/RuleBasedExecutor.js';
import { NaiveBaselineProvider } from '../../agents/providers/NaiveBaselineProvider.js';
import { ClaudeCodeProvider } from '../../agents/providers/ClaudeCodeProvider.js';
import { CodexProvider, DevinProvider, OpenHandsProvider, AiderProvider } from '../../agents/providers/FutureProvider.js';
import type { AgentProvider } from '../../agents/providers/AgentProvider.js';
import type { AgentTask } from '../../core/types.js';
import { flagString } from './_shared.js';

/**
 * provider:test — exercise any registered provider against a synthetic task.
 *
 * Useful for: (a) sanity-checking a new provider, (b) verifying the
 * ClaudeCli adapter degrades to dry-run when the binary is missing,
 * (c) demoing the seam to reviewers.
 */
export async function providerTest(flags: Record<string, string | boolean>): Promise<number> {
  const name = flagString(flags, 'provider', 'mock')!;
  const dryRun = flags['dry-run'] === true || flags['dry-run'] === 'true' || true; // always dry-run by default
  let provider: AgentProvider;
  switch (name) {
    case 'mock':
      provider = new MockAgentProvider('happy');
      break;
    case 'local-command':
      provider = new LocalCommandProvider();
      break;
    case 'rule-based':
      provider = new RuleBasedExecutor();
      break;
    case 'naive-baseline':
      provider = new NaiveBaselineProvider();
      break;
    case 'claude-code':
    case 'claude-cli':
      // The ClaudeCodeProvider already degrades when DEMO2PROJECT_CLAUDE_CODE
      // is not set. We force `enabled:false` for dry-run; the provider will
      // then return a skipped result with `provider_not_enabled` reason,
      // proving the adapter is wired but not actually shelling out.
      provider = new ClaudeCodeProvider({ enabled: !dryRun });
      break;
    case 'codex': provider = CodexProvider(); break;
    case 'devin': provider = DevinProvider(); break;
    case 'openhands': provider = OpenHandsProvider(); break;
    case 'aider': provider = AiderProvider(); break;
    default:
      process.stderr.write(`error: unknown provider "${name}"\n`);
      return 2;
  }

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'd2p-provtest-'));
  await fs.writeFile(path.join(tmp, 'package.json'), JSON.stringify({ name: 'provtest', main: 'app.js' }));
  await fs.writeFile(path.join(tmp, 'app.js'), 'console.log("ok");\n');

  const task: AgentTask = {
    id: 'task_provtest',
    iteration_id: 'iter_provtest',
    assigned_to: 'executor',
    title: 'Author or extend README.md',
    description: 'add a README scaffold',
    acceptance_criteria: ['README exists', 'README has Install + Usage'],
    expected_changed_files: ['README.md'],
    verification_commands: ['test -s README.md'],
    priority: 'medium',
    status: 'pending',
  };

  const r = await provider.runTask(task, {
    project_path: tmp,
    iteration_id: 'iter_provtest',
    recent_events: [],
  });

  const summary = {
    provider: provider.name,
    dry_run: dryRun,
    task_status: r.status,
    changed_files: r.changed_files,
    commands_run: r.commands_run,
    unable_to_verify_reason: r.unable_to_verify_reason ?? null,
    summary: r.summary,
    risks: r.risks,
    next_steps: r.next_steps,
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  return r.status === 'failed' ? 1 : 0;
}
