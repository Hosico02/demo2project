import path from 'node:path';
import { SupervisorAgent } from '../../agents/SupervisorAgent.js';
import { MockAgentProvider, type MockMode } from '../../agents/providers/MockAgentProvider.js';
import { LocalCommandProvider } from '../../agents/providers/LocalCommandProvider.js';
import { RuleBasedExecutor } from '../../agents/providers/RuleBasedExecutor.js';
import { ClaudeCodeProvider } from '../../agents/providers/ClaudeCodeProvider.js';
import { CodexProvider, DevinProvider, OpenHandsProvider, AiderProvider } from '../../agents/providers/FutureProvider.js';
import type { AgentProvider } from '../../agents/providers/AgentProvider.js';
import { flagNumber, flagString, requireProject } from './_shared.js';

export async function iterate(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const goal = flagString(flags, 'goal', 'turn demo into project-ready baseline')!;
  const maxIter = flagNumber(flags, 'max-iterations', 1);
  const providerName = flagString(flags, 'provider', 'mock')!;
  const mode = (flagString(flags, 'mode', 'happy') ?? 'happy') as MockMode;

  let provider: AgentProvider;
  switch (providerName) {
    case 'mock':
      provider = new MockAgentProvider(mode);
      break;
    case 'local-command':
      provider = new LocalCommandProvider();
      break;
    case 'rule-based':
      provider = new RuleBasedExecutor();
      break;
    case 'claude-code':
      provider = new ClaudeCodeProvider({ enabled: true });
      break;
    case 'codex':
      provider = CodexProvider();
      break;
    case 'devin':
      provider = DevinProvider();
      break;
    case 'openhands':
      provider = OpenHandsProvider();
      break;
    case 'aider':
      provider = AiderProvider();
      break;
    default:
      process.stderr.write(`error: unknown provider "${providerName}"\n`);
      return 2;
  }

  const supervisor = new SupervisorAgent();
  const systemRoot = flagString(flags, 'system-root', defaultSystemRoot())!;
  const useWorktree = flags['use-worktree'] === true || flags['use-worktree'] === 'true';
  const summaries = await supervisor.iterate({
    projectPath: project,
    goal,
    provider,
    maxIterations: maxIter,
    systemRoot,
    useWorktree,
  });

  for (const s of summaries) {
    process.stdout.write(
      `iter ${s.iteration_id}: score ${s.project_score_before.total} → ${s.project_score_after.total} ` +
        `(grade ${s.project_score_before.grade} → ${s.project_score_after.grade}), ` +
        `${s.executor_results.length} task(s), ` +
        `${s.qa_cases_created_or_updated.length} qa case(s)\n`,
    );
  }
  process.stdout.write(
    `\ndone — ${summaries.length} iteration(s). State persisted under <project>/.demo2project/.\n`,
  );
  return 0;
}

function defaultSystemRoot(): string {
  // dist/cli/commands/iterate.js → up 3 directories = project root
  return path.resolve(new URL('../../..', import.meta.url).pathname);
}
