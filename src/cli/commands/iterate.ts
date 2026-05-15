import path from 'node:path';
import { SupervisorAgent } from '../../agents/SupervisorAgent.js';
import { MockAgentProvider, type MockMode } from '../../agents/providers/MockAgentProvider.js';
import { LocalCommandProvider } from '../../agents/providers/LocalCommandProvider.js';
import { RuleBasedExecutor } from '../../agents/providers/RuleBasedExecutor.js';
import { ClaudeCodeProvider, ClaudeCliProvider } from '../../agents/providers/ClaudeCodeProvider.js';
import { MiniMaxProvider } from '../../agents/providers/MiniMaxProvider.js';
import { CodexProvider, DevinProvider, OpenHandsProvider, AiderProvider } from '../../agents/providers/FutureProvider.js';
import type { AgentProvider } from '../../agents/providers/AgentProvider.js';
import type { AdvisoryAgentRole } from '../../core/types.js';
import { MiniMaxAdvisoryProvider } from '../../agents/advisory/MiniMaxAdvisoryProvider.js';
import { flagNumber, flagString, requireProject } from './_shared.js';

export async function iterate(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const goal = flagString(flags, 'goal', 'turn demo into project-ready baseline')!;
  const maxIter = flagNumber(flags, 'max-iterations', 1);
  const providerName = flagString(flags, 'provider', 'mock')!;
  const mode = (flagString(flags, 'mode', 'happy') ?? 'happy') as MockMode;
  const allowWeb = flags.web === true || flags.web === 'true';
  const refreshModels = allowWeb || flags['refresh-models'] === true || flags['refresh-models'] === 'true';
  const useAdvisoryAgents = flags['advisory-agents'] === true || flags['advisory-agents'] === 'true';
  if (refreshModels && !allowWeb) {
    process.stderr.write('error: official model refresh requires explicit --web network opt-in\n');
    return 2;
  }
  if (useAdvisoryAgents && !allowWeb) {
    process.stderr.write('error: model-backed advisory agents require explicit --web network opt-in\n');
    return 2;
  }

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
    case 'claude-cli':
      provider = new ClaudeCliProvider({ enabled: true });
      break;
    case 'minimax':
    case 'minimax-m27':
      provider = new MiniMaxProvider({ enabled: true });
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
  const advisoryProvider = useAdvisoryAgents ? buildAdvisoryProvider(flags) : null;
  if (useAdvisoryAgents && !advisoryProvider) return 2;
  const summaries = await supervisor.iterate({
    projectPath: project,
    goal,
    provider,
    maxIterations: maxIter,
    systemRoot,
    useWorktree,
    officialModelCatalog: refreshModels ? { allowNetwork: allowWeb } : undefined,
    advisory: advisoryProvider
      ? {
        provider: advisoryProvider,
        roles: advisoryRoles(flags),
        allowNetwork: allowWeb,
        autoResearch: true,
      }
      : undefined,
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

function buildAdvisoryProvider(flags: Record<string, string | boolean>) {
  const providerName = flagString(flags, 'advisory-provider', 'minimax')!;
  switch (providerName) {
    case 'minimax':
    case 'minimax-m27':
      return new MiniMaxAdvisoryProvider({ enabled: true });
    default:
      process.stderr.write(`error: unknown advisory provider "${providerName}"\n`);
      return null;
  }
}

function advisoryRoles(flags: Record<string, string | boolean>): AdvisoryAgentRole[] {
  const raw = flagString(flags, 'advisory-roles', '');
  const allowed: AdvisoryAgentRole[] = ['market_comparator', 'gap_critic', 'planner_critic', 'reviewer_critic'];
  if (!raw) return allowed;
  const selected = raw
    .split(',')
    .map((role) => role.trim())
    .filter((role): role is AdvisoryAgentRole => allowed.includes(role as AdvisoryAgentRole));
  return selected.length > 0 ? selected : allowed;
}

function defaultSystemRoot(): string {
  // dist/cli/commands/iterate.js → up 3 directories = project root
  return path.resolve(new URL('../../..', import.meta.url).pathname);
}
