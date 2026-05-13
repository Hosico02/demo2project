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
// --- Phase 7 ---
import { securityThreatModel, securityThreat, policyValidate, policyExplain, policyCheckCmd, policyViolations, policyReport } from './commands/security.js';
import { permissionsList, permissionsExplain, permissionsIssue, permissionsRevoke, permissionsAudit } from './commands/permissions.js';
import { trustCheck, trustSet, repoQuarantine, repoUnquarantine, trustReport, trustExplain } from './commands/trust.js';
import { promptInjectionScan, promptInjectionExplain } from './commands/promptInjection.js';
import { secretsScan, secretsScanLog, secretsReport } from './commands/secrets.js';
import { supplyChainScan, supplyChainDiff, supplyChainReport } from './commands/supplyChain.js';
import { guardCheckCommand, guardCheckFile, guardReport } from './commands/guard.js';
import { approvalList, approvalShow, approvalApprove, approvalReject, approvalRevoke } from './commands/approvalNew.js';
import { auditShow, auditVerify, auditReport, auditExplain } from './commands/audit.js';
import { incidentList, incidentShow, incidentResolve, emergencyStop, emergencyStatus, emergencyResume } from './commands/incident.js';
import { privacyMode, privacySetMode, privacyInventory, privacyDelete, retentionPolicy, retentionCleanup } from './commands/privacy.js';
import { pluginScan, mcpScan, hooksScan, integrationSecurityReport } from './commands/integrations.js';
import { governanceRoles, governanceWhoami, governanceCan, governanceReport as govReport7 } from './commands/governanceEnterprise.js';
import { claudeInstallSecurityHooks, claudeUninstallSecurityHooks, claudeHooksStatus } from './commands/claudeSecurityHooks.js';
// --- Phase 6 ---
import { autonomyPolicyCmd, autonomySetLevelCmd, autonomyExplainCmd } from './commands/autonomy.js';
import { autonomyRun, autonomyStatus, autonomyReport, trendShow, trendExplain } from './commands/autonomyRun.js';
import { driftCheck, driftCompare } from './commands/drift.js';
import { regressionBisect, regressionExplain, rollbackStable } from './commands/regressionBisector.js';
import { selfDiagnose, selfHypotheses, selfExperiment, selfAccept, selfReject, selfRollback } from './commands/selfImprove.js';
import { plannerCalibrate, plannerReport, plannerExplain } from './commands/plannerCalibration.js';
import { executorReliability, executorRecommend, executorCompare } from './commands/executorReliability.js';
import { qaHealth, qaCompact, qaMerge, qaRetireStale, qaReportMemory } from './commands/qaHealth.js';
import { replayCreate, replayRun, replayExplain } from './commands/replay.js';
import { scenarioList, scenarioRun } from './commands/scenario.js';
import { governanceLog, governanceExplain } from './commands/governance.js';
import { handoffCreate, handoffShow } from './commands/handoff.js';

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
    // --- Phase 6 ---
    case 'autonomy:policy':
      return autonomyPolicyCmd(args.flags);
    case 'autonomy:set-level':
      return autonomySetLevelCmd(args.flags);
    case 'autonomy:explain':
      return autonomyExplainCmd(args.flags);
    case 'autonomy:run':
      return autonomyRun(args.flags);
    case 'autonomy:status':
      return autonomyStatus(args.flags);
    case 'autonomy:report':
      return autonomyReport(args.flags);
    case 'trend:show':
      return trendShow(args.flags);
    case 'trend:explain':
      return trendExplain(args.flags);
    case 'drift:check':
      return driftCheck(args.flags);
    case 'drift:compare':
      return driftCompare(args.flags);
    case 'regression:bisect':
      return regressionBisect(args.flags);
    case 'regression:explain':
      return regressionExplain(args.flags);
    case 'rollback:stable':
      return rollbackStable(args.flags);
    case 'self:diagnose':
      return selfDiagnose(args.flags);
    case 'self:hypotheses':
      return selfHypotheses(args.flags);
    case 'self:experiment':
      return selfExperiment(args.flags);
    case 'self:accept':
      return selfAccept(args.flags);
    case 'self:reject':
      return selfReject(args.flags);
    case 'self:rollback':
      return selfRollback(args.flags);
    case 'planner:calibrate':
      return plannerCalibrate(args.flags);
    case 'planner:report':
      return plannerReport(args.flags);
    case 'planner:explain':
      return plannerExplain(args.flags);
    case 'executor:reliability':
      return executorReliability(args.flags);
    case 'executor:recommend':
      return executorRecommend(args.flags);
    case 'executor:compare':
      return executorCompare(args.flags);
    case 'qa:health':
      return qaHealth(args.flags);
    case 'qa:compact':
      return qaCompact(args.flags);
    case 'qa:merge':
      return qaMerge(args.flags);
    case 'qa:retire-stale':
      return qaRetireStale(args.flags);
    case 'qa:report-memory':
      return qaReportMemory(args.flags);
    case 'replay:create':
      return replayCreate(args.flags);
    case 'replay:run':
      return replayRun(args.flags);
    case 'replay:explain':
      return replayExplain(args.flags);
    case 'scenario:list':
      return scenarioList(args.flags);
    case 'scenario:run':
      return scenarioRun(args.flags);
    case 'governance:log':
      return governanceLog(args.flags);
    case 'governance:explain':
      return governanceExplain(args.flags);
    case 'handoff:create':
      return handoffCreate(args.flags);
    case 'handoff:show':
      return handoffShow(args.flags);
    // --- Phase 7: security ---
    case 'security:threat-model':
      return securityThreatModel(args.flags);
    case 'security:threat':
      return securityThreat(args.flags);
    case 'policy:validate':
      return policyValidate();
    case 'policy:explain':
      return policyExplain(args.flags);
    case 'policy:check':
      return policyCheckCmd(args.flags);
    case 'policy:violations':
      return policyViolations(args.flags);
    case 'policy:report':
      return policyReport();
    case 'permissions:list':
      return permissionsList();
    case 'permissions:explain':
      return permissionsExplain(args.flags);
    case 'permissions:issue':
      return permissionsIssue(args.flags);
    case 'permissions:revoke':
      return permissionsRevoke(args.flags);
    case 'permissions:audit':
      return permissionsAudit();
    case 'trust:check':
      return trustCheck(args.flags);
    case 'trust:set':
      return trustSet(args.flags);
    case 'trust:report':
      return trustReport(args.flags);
    case 'trust:explain':
      return trustExplain(args.flags);
    case 'repo:quarantine':
      return repoQuarantine(args.flags);
    case 'repo:unquarantine':
      return repoUnquarantine(args.flags);
    case 'prompt-injection:scan':
      return promptInjectionScan(args.flags);
    case 'prompt-injection:explain':
      return promptInjectionExplain(args.flags);
    case 'secrets:scan':
      return secretsScan(args.flags);
    case 'secrets:scan-log':
      return secretsScanLog(args.flags);
    case 'secrets:report':
      return secretsReport(args.flags);
    case 'supply-chain:scan':
      return supplyChainScan(args.flags);
    case 'supply-chain:diff':
      return supplyChainDiff(args.flags);
    case 'supply-chain:report':
      return supplyChainReport(args.flags);
    case 'guard:check-command':
      return guardCheckCommand(args.flags);
    case 'guard:check-file':
      return guardCheckFile(args.flags);
    case 'guard:report':
      return guardReport();
    case 'approval:list':
      return approvalList();
    case 'approval:show':
      return approvalShow(args.flags);
    case 'approval:approve':
      return approvalApprove(args.flags);
    case 'approval:reject':
      return approvalReject(args.flags);
    case 'approval:revoke':
      return approvalRevoke(args.flags);
    case 'audit:show':
      return auditShow(args.flags);
    case 'audit:verify':
      return auditVerify();
    case 'audit:report':
      return auditReport();
    case 'audit:explain':
      return auditExplain(args.flags);
    case 'incident:list':
      return incidentList();
    case 'incident:show':
      return incidentShow(args.flags);
    case 'incident:resolve':
      return incidentResolve(args.flags);
    case 'emergency:stop':
      return emergencyStop(args.flags);
    case 'emergency:status':
      return emergencyStatus();
    case 'emergency:resume':
      return emergencyResume(args.flags);
    case 'privacy:mode':
      return privacyMode();
    case 'privacy:set-mode':
      return privacySetMode(args.flags);
    case 'privacy:inventory':
      return privacyInventory(args.flags);
    case 'privacy:delete':
      return privacyDelete(args.flags);
    case 'retention:policy':
      return retentionPolicy(args.flags);
    case 'retention:cleanup':
      return retentionCleanup(args.flags);
    case 'plugin:scan':
      return pluginScan(args.flags);
    case 'mcp:scan':
      return mcpScan(args.flags);
    case 'hooks:scan':
      return hooksScan(args.flags);
    case 'integration:security-report':
      return integrationSecurityReport(args.flags);
    case 'governance:roles':
      return governanceRoles();
    case 'governance:whoami':
      return governanceWhoami();
    case 'governance:can':
      return governanceCan(args.flags);
    case 'governance:report':
      return govReport7();
    case 'claude:install-security-hooks':
      return claudeInstallSecurityHooks(args.flags);
    case 'claude:uninstall-security-hooks':
      return claudeUninstallSecurityHooks(args.flags);
    case 'claude:hooks-status':
      return claudeHooksStatus(args.flags);
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
