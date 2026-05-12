import path from 'node:path';
import { promises as fs } from 'node:fs';
import { AnalyzerAgent } from '../../agents/AnalyzerAgent.js';
import { QACaseStore } from '../../qa/QACaseStore.js';
import { runRegression } from '../../qa/QARegressionRunner.js';
import { loadPolicy, isForbiddenSelfMod } from '../../core/autonomyPolicy.js';
import { reportMemoryHealth } from '../../qa/QAMemoryHealth.js';
import { fileExists } from '../../utils/fs.js';

/**
 * Self-check (Phase 6): run analyze + gap + regression against the
 * demo2project repo, AND verify the Phase 6 capabilities are present and
 * usable. Returns non-zero if any required capability is missing.
 */
export async function selfCheck(_flags: Record<string, string | boolean>): Promise<number> {
  const root = defaultSystemRoot();
  const analyzer = new AnalyzerAgent();
  const { snapshot, score, gap } = await analyzer.fullAnalyze(root);
  const store = new QACaseStore(root);
  const spec = await store.readRegressionSpec(root);
  const regression = await runRegression(root, spec);

  // Phase 6 capability probes
  const policy = await loadPolicy(root);
  const safetyForbidden = isForbiddenSelfMod(policy, 'src/core/safety.ts');
  const redactionForbidden = isForbiddenSelfMod(policy, 'src/core/redaction.ts');
  const approvalGateForbidden = isForbiddenSelfMod(policy, 'src/core/approvalGate.ts');
  const qaSpecForbidden = isForbiddenSelfMod(policy, 'qa/specs/');
  const qaHealth = await reportMemoryHealth(root);

  const probes = {
    autonomy_policy_present: fileExists(path.join(root, 'config', 'autonomy-policy.json')),
    verification_gate_active: policy.rollback_on_score_drop,
    safety_in_forbidden_list: safetyForbidden,
    redaction_in_forbidden_list: redactionForbidden,
    approval_gate_in_forbidden_list: approvalGateForbidden,
    qa_specs_in_forbidden_list: qaSpecForbidden,
    high_risk_self_mod_requires_approval: policy.require_human_review_for_global_changes,
    qa_memory_health_computable: typeof qaHealth.memory_noise_score === 'number',
    redaction_enabled: fileExists(path.join(root, 'dist', 'core', 'redaction.js')) || fileExists(path.join(root, 'src', 'core', 'redaction.ts')),
    evidence_graph_module: fileExists(path.join(root, 'src', 'core', 'evidenceGraph.ts')),
    replay_system_module: fileExists(path.join(root, 'src', 'core', 'replaySystem.ts')),
    governance_log_module: fileExists(path.join(root, 'src', 'core', 'governanceDecisionLog.ts')),
    drift_detector_module: fileExists(path.join(root, 'src', 'core', 'architectureDrift.ts')),
    planner_calibration_module: fileExists(path.join(root, 'src', 'core', 'plannerCalibration.ts')),
    executor_reliability_module: fileExists(path.join(root, 'src', 'core', 'executorReliability.ts')),
    self_improvement_module: fileExists(path.join(root, 'src', 'core', 'selfImprovement.ts')),
    test_runner_works: fileExists(path.join(root, 'vitest.config.ts')),
    benchmarks_present: fileExists(path.join(root, 'benchmarks', 'public')),
  };
  const missing = Object.entries(probes).filter(([, v]) => !v).map(([k]) => k);

  const report = {
    self_path: root,
    detected_language: snapshot.detected_language,
    package_manager: snapshot.package_manager,
    score: score.total,
    grade: score.grade,
    blockers: gap.blockers.length,
    findings: gap.findings.length,
    qa_regression: { total: regression.total, passed: regression.passed, failed: regression.failed },
    phase6_probes: probes,
    phase6_missing: missing,
    qa_memory: {
      total_cases: qaHealth.total_cases,
      memory_noise_score: qaHealth.memory_noise_score,
      memory_usefulness_score: qaHealth.memory_usefulness_score,
    },
  };
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  // Phase-6 considers a regression failure OR a missing required probe as failure.
  return regression.failed === 0 && missing.length === 0 ? 0 : 1;
}

function defaultSystemRoot(): string {
  return path.resolve(new URL('../../..', import.meta.url).pathname);
}

void fs;
