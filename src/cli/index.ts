#!/usr/bin/env node
import { init } from './commands/init.js';
import { analyze } from './commands/analyze.js';
import { gap } from './commands/gap.js';
import { plan } from './commands/plan.js';
import { iterate } from './commands/iterate.js';
import { qaPreflight } from './commands/qaPreflight.js';
import { qaLearn } from './commands/qaLearn.js';
import { qaRegression } from './commands/qaRegression.js';
import { selfCheck } from './commands/selfCheck.js';
import { selfIterate } from './commands/selfIterate.js';
import { benchmark } from './commands/benchmark.js';
import { rollback } from './commands/rollback.js';
import { claudeInstallHooks } from './commands/claudeInstallHooks.js';
import { docsTruth } from './commands/docsTruth.js';
import { evaluate } from './commands/evaluate.js';
import { qaAudit, qaRetire, qaPromote } from './commands/qaAudit.js';
import { providerTest } from './commands/providerTest.js';
import { evidenceShow, evidenceExplain } from './commands/evidence.js';
import { costReport } from './commands/cost.js';
import { compareExecutors } from './commands/compareExecutors.js';
import { longRun } from './commands/longRun.js';
import { approvalsList, approvalsApprove, approvalsReject } from './commands/approvals.js';
import { selfIterateSandbox } from './commands/selfIterateSandbox.js';
import { archetype } from './commands/archetype.js';
import { standardsList, standardsExplain, standardsValidate } from './commands/standards.js';
import { qaTransfer, qaApplicable } from './commands/qaTransfer.js';
import { corpusAddCmd, corpusListCmd, corpusEvaluateCmd, corpusRemoveCmd, corpusReportCmd } from './commands/corpus.js';
import { learnWorkspaceCmd, learnProjectCmd, learnPatternsCmd, learnExplainCmd } from './commands/learn.js';
import { learningCandidatesCmd, learningApproveCmd, learningRejectCmd, learningExplainCmd } from './commands/learningGovernance.js';
import { similar } from './commands/similar.js';
import { standardsSuggestCmd, standardsApproveCmd, standardsRejectCmd, standardsSuggestionsListCmd } from './commands/standardsFeedback.js';
import { generalize } from './commands/generalize.js';
import { workspaceReport } from './commands/workspaceReport.js';
import { taxonomyList, taxonomyExplain } from './commands/taxonomy.js';
import { redactTest } from './commands/redactTest.js';

interface ParsedArgs {
  command: string;
  flags: Record<string, string | boolean>;
  positional: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command = 'help', ...rest] = argv;
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        flags[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      } else {
        const key = arg.slice(2);
        const next = rest[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = true;
        }
      }
    } else {
      positional.push(arg);
    }
  }
  return { command, flags, positional };
}

const HELP = `demo2project — turn demos into project-ready baselines via multi-agent iteration

Usage:
  demo2project <command> [--flags]

Commands:
  init                            Bootstrap config files in the current dir
  analyze     --project <path>    Print ProjectSnapshot + ProjectScore
  gap         --project <path>    Print GapReport
  plan        --project <path>    Print IterationPlan
              --goal <text>
  iterate     --project <path>    Run one or more iteration rounds
              --goal <text>
              --max-iterations <n>
              --provider mock|local-command|rule-based|claude-code
              --mode happy|change_without_verify|change_with_unable_reason|noop  (mock only)
  qa:preflight --project <path>   Load QA cases and report active count
  qa:learn    --events <file>     Generate QA cases from a JSON array of events
              --project <path>
  qa:regression --project <path>  Run regression spec against project history
                [--system-root <path>]
  self-check                      Run analyze/gap/regression against this repo
  self-iterate                    Read-only: print the plan this repo would apply to itself
  benchmark                       Score every project under benchmarks/ + examples/
  eval        --all | --case <n>  A/B comparison: naive baseline vs Demo2Project loop
  qa:audit    --project <path>    Re-evaluate QA case lifecycles; --apply persists
  qa:retire   --project <path> --case <id> [--reason <r>]
  qa:promote  --project <path> --case <id>
  provider:test --provider <name> Exercise a provider against a synthetic task

Examples:
  demo2project analyze --project examples/bad-demo
  demo2project iterate --project examples/bad-demo --goal "project-ready" --max-iterations 1
  demo2project qa:regression --project examples/bad-demo
  demo2project self-check
`;

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  switch (args.command) {
    case 'init':
      return init(args.flags);
    case 'analyze':
      return analyze(args.flags);
    case 'gap':
      return gap(args.flags);
    case 'plan':
      return plan(args.flags);
    case 'iterate':
      return iterate(args.flags);
    case 'qa:preflight':
      return qaPreflight(args.flags);
    case 'qa:learn':
      return qaLearn(args.flags);
    case 'qa:regression':
      return qaRegression(args.flags);
    case 'self-check':
      return selfCheck(args.flags);
    case 'self-iterate':
      return selfIterate(args.flags);
    case 'benchmark':
      return benchmark(args.flags);
    case 'rollback':
      return rollback(args.flags);
    case 'claude:install-hooks':
      return claudeInstallHooks(args.flags);
    case 'docs:truth':
      return docsTruth(args.flags);
    case 'eval':
      return evaluate(args.flags);
    case 'qa:audit':
      return qaAudit(args.flags);
    case 'qa:retire':
      return qaRetire(args.flags);
    case 'qa:promote':
      return qaPromote(args.flags);
    case 'provider:test':
      return providerTest(args.flags);
    case 'evidence:show':
      return evidenceShow(args.flags);
    case 'evidence:explain':
      return evidenceExplain(args.flags);
    case 'cost:report':
      return costReport(args.flags);
    case 'compare-executors':
      return compareExecutors(args.flags);
    case 'long-run':
      return longRun(args.flags);
    case 'approvals:list':
      return approvalsList(args.flags);
    case 'approvals:approve':
      return approvalsApprove(args.flags);
    case 'approvals:reject':
      return approvalsReject(args.flags);
    case 'self-iterate-sandbox':
      return selfIterateSandbox(args.flags);
    // --- Phase 5 ---
    case 'archetype':
      return archetype(args.flags);
    case 'standards:list':
      return standardsList(args.flags);
    case 'standards:explain':
      return standardsExplain(args.flags);
    case 'standards:validate':
      return standardsValidate(args.flags);
    case 'standards:suggest-updates':
      return standardsSuggestCmd(args.flags);
    case 'standards:approve-update':
      return standardsApproveCmd(args.flags);
    case 'standards:reject-update':
      return standardsRejectCmd(args.flags);
    case 'standards:suggestions':
      return standardsSuggestionsListCmd(args.flags);
    case 'qa:transfer':
      return qaTransfer(args.flags);
    case 'qa:applicable':
      return qaApplicable(args.flags);
    case 'corpus:add':
      return corpusAddCmd(args.flags);
    case 'corpus:list':
      return corpusListCmd(args.flags);
    case 'corpus:evaluate':
      return corpusEvaluateCmd(args.flags);
    case 'corpus:remove':
      return corpusRemoveCmd(args.flags);
    case 'corpus:report':
      return corpusReportCmd(args.flags);
    case 'learn:workspace':
      return learnWorkspaceCmd(args.flags);
    case 'learn:project':
      return learnProjectCmd(args.flags);
    case 'learn:patterns':
      return learnPatternsCmd(args.flags);
    case 'learn:explain':
      return learnExplainCmd(args.flags);
    case 'learning:candidates':
      return learningCandidatesCmd(args.flags);
    case 'learning:approve':
      return learningApproveCmd(args.flags);
    case 'learning:reject':
      return learningRejectCmd(args.flags);
    case 'learning:explain':
      return learningExplainCmd(args.flags);
    case 'similar':
      return similar(args.flags);
    case 'generalize':
      return generalize(args.flags);
    case 'report:workspace':
      return workspaceReport(args.flags);
    case 'taxonomy:list':
      return taxonomyList(args.flags);
    case 'taxonomy:explain':
      return taxonomyExplain(args.flags);
    case 'redact:test':
      return redactTest(args.flags);
    case 'help':
    case '--help':
    case '-h':
      process.stdout.write(HELP);
      return 0;
    default:
      process.stderr.write(`unknown command: ${args.command}\n\n${HELP}`);
      return 2;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`error: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
    process.exit(1);
  });
