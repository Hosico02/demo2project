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
  benchmark                       Score every project under examples/ and print a table

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
