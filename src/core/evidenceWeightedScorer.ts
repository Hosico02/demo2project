import path from 'node:path';
import type {
  ProjectSnapshot,
  ProjectStandard,
  ProjectScore,
  ScoreEvidenceEntry,
  ScoreBreakdown,
  ProjectGrade,
} from './types.js';
import { scoreProject, scoreTotalFromBreakdown } from './projectScorer.js';
import { runCommand } from './commandRunner.js';
import { runDocsTruth } from './docsTruth.js';
import { runAntiGaming, type AntiGamingFinding } from './antiGamingScorer.js';
import { fileExists } from '../utils/fs.js';
import { applyScoreGate, evaluateScoreGate } from './scoreGate.js';

/**
 * Evidence-weighted scoring — Phase 3 anti-gaming.
 *
 * The base `scoreProject` rewards the *existence* of files. That makes it
 * trivial to game: drop empty tests/, an empty CI yaml, a 5-line README and
 * you can claim a big score gain without anything actually working.
 *
 * This wrapper:
 *   1. Computes the base score (deterministic, file-based).
 *   2. For each dimension that has a verifiable claim (test, build, docs,
 *      ci), runs the verification command in the project dir.
 *   3. Penalizes dimensions where the claim exists but verification failed
 *      (or was never run when requested).
 *   4. Emits a `score_evidence[]` array so callers can audit each judgment.
 *
 * If `runCommands=false` (default), no commands are executed — but we still
 * inspect docs-truth and missing-evidence patterns. Useful in CI / tests.
 */
export interface EvidenceWeightedOptions {
  /** Actually execute test/build commands. Default false (read-only check). */
  runCommands?: boolean;
  /** Per-command timeout. */
  timeoutMs?: number;
}

const PENALTIES = {
  // dimension -> [maxPenaltyIfUnverified, maxPenaltyIfFailed]
  test_score: [4, 10],
  build_score: [3, 8],
  docs_score: [3, 6],
  agent_process_score: [2, 4],
  config_score: [2, 4],
};

export async function scoreProjectWithEvidence(
  snapshot: ProjectSnapshot,
  standard: ProjectStandard,
  opts: EvidenceWeightedOptions = {},
): Promise<ProjectScore & { anti_gaming_findings?: AntiGamingFinding[]; confidence_adjusted_score?: number }> {
  const base = await scoreProject(snapshot, standard);
  const breakdown: ScoreBreakdown = { ...base.breakdown };
  const evidence: ScoreEvidenceEntry[] = [];
  const notes: string[] = [...base.notes];
  const projectPath = snapshot.project_path;

  // Anti-gaming detectors — apply suggested penalties to the named dimension.
  const antiGaming = await runAntiGaming(snapshot);
  const breakdownAsRecord = breakdown as unknown as Record<string, number>;
  for (const f of antiGaming) {
    const before = breakdownAsRecord[f.dimension] ?? 0;
    breakdownAsRecord[f.dimension] = Math.max(0, before - f.suggested_penalty);
    notes.push(`anti-gaming/${f.detector}: ${f.message} (-${f.suggested_penalty})`);
    evidence.push({
      dimension: f.dimension,
      claimed: true,
      verified: false,
      result: 'failed',
      confidence: 'high',
      notes: `${f.detector}: ${f.message}`,
    });
  }

  // --- docs claims (always run; cheap, no shell) ---
  const docs = await runDocsTruth(projectPath);
  const docsClaimed = docs.total_claims > 0;
  const docsVerified = docs.missing === 0 && docsClaimed;
  if (docsClaimed && !docsVerified) {
    const penalty = Math.min(PENALTIES.docs_score[1], docs.missing * 2);
    breakdown.docs_score = Math.max(0, breakdown.docs_score - penalty);
    notes.push(`docs penalty: ${docs.missing} README claim(s) without matching evidence (-${penalty})`);
  }
  evidence.push({
    dimension: 'docs_score',
    claimed: docsClaimed,
    verified: docsVerified,
    result: docs.total_claims === 0 ? 'unrun' : docs.missing === 0 ? 'passed' : 'failed',
    confidence: docsClaimed ? (docsVerified ? 'high' : 'medium') : 'low',
    notes: docs.missing > 0 ? `${docs.missing}/${docs.total_claims} README claims unverified` : undefined,
  });

  // --- test claim ---
  if (snapshot.test_commands.length > 0) {
    if (opts.runCommands) {
      const cmd = snapshot.test_commands[0]!;
      const r = await runCommand(cmd, { cwd: projectPath, timeoutMs: opts.timeoutMs ?? 60_000 });
      const suspiciousOutput = detectCriticalVerificationOutput(r.stdout_summary, r.stderr_summary);
      const testVerified = r.passed && !suspiciousOutput;
      evidence.push({
        dimension: 'test_score',
        claimed: true,
        verified: testVerified,
        evidence_command: cmd,
        result: testVerified ? 'passed' : 'failed',
        confidence: testVerified ? 'high' : 'medium',
        notes: testVerified
          ? undefined
          : suspiciousOutput
            ? `test command emitted critical runtime output: ${suspiciousOutput}`
            : `test command failed: ${r.failure_reason ?? 'non-zero exit'}`,
        stdout_summary: r.stdout_summary,
        stderr_summary: r.stderr_summary,
        failure_reason: suspiciousOutput ? `suspicious_output:${suspiciousOutput}` : r.failure_reason,
      });
      if (!testVerified) {
        const penalty = PENALTIES.test_score[1];
        breakdown.test_score = Math.max(0, breakdown.test_score - penalty);
        notes.push(suspiciousOutput
          ? `test penalty: ${cmd} emitted critical runtime output (-${penalty})`
          : `test penalty: ${cmd} failed (-${penalty})`);
      }
    } else {
      evidence.push({
        dimension: 'test_score',
        claimed: true,
        verified: false,
        evidence_command: snapshot.test_commands[0],
        result: 'unrun',
        confidence: 'medium',
        notes: 'test command declared but not executed (runCommands=false)',
      });
      // Light penalty for unverified
      const penalty = PENALTIES.test_score[0];
      breakdown.test_score = Math.max(0, breakdown.test_score - penalty);
    }
  } else {
    evidence.push({ dimension: 'test_score', claimed: false, verified: false, confidence: 'high' });
  }

  // --- build claim ---
  if (snapshot.build_commands.length > 0) {
    if (opts.runCommands) {
      const cmd = snapshot.build_commands[0]!;
      const r = await runCommand(cmd, { cwd: projectPath, timeoutMs: opts.timeoutMs ?? 60_000 });
      const suspiciousOutput = detectCriticalVerificationOutput(r.stdout_summary, r.stderr_summary);
      const buildVerified = r.passed && !suspiciousOutput;
      evidence.push({
        dimension: 'build_score',
        claimed: true,
        verified: buildVerified,
        evidence_command: cmd,
        result: buildVerified ? 'passed' : 'failed',
        confidence: buildVerified ? 'high' : 'medium',
        notes: suspiciousOutput ? `build command emitted critical runtime output: ${suspiciousOutput}` : undefined,
        stdout_summary: r.stdout_summary,
        stderr_summary: r.stderr_summary,
        failure_reason: suspiciousOutput ? `suspicious_output:${suspiciousOutput}` : r.failure_reason,
      });
      if (!buildVerified) {
        const penalty = PENALTIES.build_score[1];
        breakdown.build_score = Math.max(0, breakdown.build_score - penalty);
        notes.push(suspiciousOutput
          ? `build penalty: ${cmd} emitted critical runtime output (-${penalty})`
          : `build penalty: ${cmd} failed (-${penalty})`);
      }
    } else {
      evidence.push({
        dimension: 'build_score',
        claimed: true,
        verified: false,
        evidence_command: snapshot.build_commands[0],
        result: 'unrun',
        confidence: 'medium',
      });
      const penalty = PENALTIES.build_score[0];
      breakdown.build_score = Math.max(0, breakdown.build_score - penalty);
    }
  } else {
    evidence.push({ dimension: 'build_score', claimed: false, verified: false, confidence: 'high' });
  }

  // --- CI claim (file-existence sanity, no execution) ---
  const hasCi = fileExists(path.join(projectPath, '.github', 'workflows'))
    || fileExists(path.join(projectPath, '.gitlab-ci.yml'))
    || fileExists(path.join(projectPath, '.circleci'));
  evidence.push({
    dimension: 'agent_process_score',
    claimed: hasCi,
    verified: hasCi && snapshot.test_commands.length > 0,
    confidence: hasCi ? 'medium' : 'high',
    notes: hasCi && snapshot.test_commands.length === 0
      ? 'CI present but no test command to run'
      : undefined,
  });
  if (hasCi && snapshot.test_commands.length === 0) {
    const penalty = PENALTIES.agent_process_score[0];
    breakdown.agent_process_score = Math.max(0, breakdown.agent_process_score - penalty);
    notes.push(`agent_process penalty: CI present but no runnable test command (-${penalty})`);
  }

  // --- config (env.example present but secrets in code → penalty) ---
  // The base scorer already samples files for forbidden patterns; we just
  // surface it as evidence here.
  const safetyClean = !notes.some((n) => /forbidden pattern matched/.test(n));
  evidence.push({
    dimension: 'safety_score',
    claimed: true,
    verified: safetyClean,
    confidence: 'medium',
  });

  const rawTotal = scoreTotalFromBreakdown(breakdown, standard);
  const score_gate = evaluateScoreGate({ evidence });
  const total = applyScoreGate(rawTotal, score_gate);
  if (score_gate.status === 'failed') {
    notes.push(`score gate failed: ${score_gate.failures.map((f) => `${f.reason} (cap ${f.cap})`).join('; ')}`);
  }
  // confidence-adjusted: an extra haircut proportional to high-severity findings
  const blockerWeight = antiGaming.filter((f) => f.severity === 'blocker').length * 4;
  const confidence_adjusted_score = Math.max(0, total - blockerWeight);
  return {
    total,
    grade: gradeFor(total),
    breakdown,
    notes,
    score_evidence: evidence,
    score_gate,
    anti_gaming_findings: antiGaming,
    confidence_adjusted_score,
  };
}

function gradeFor(total: number): ProjectGrade {
  if (total <= 30) return 'raw_demo';
  if (total <= 50) return 'working_demo';
  if (total <= 70) return 'structured_prototype';
  if (total <= 85) return 'project_ready_candidate';
  return 'production_ready_baseline';
}

function detectCriticalVerificationOutput(stdout: string, stderr: string): string | null {
  const output = `${stdout}\n${stderr}`;
  const patterns: Array<[RegExp, string]> = [
    [/\bgame thread failed\b/i, 'background_thread_failed'],
    [/Traceback \(most recent call last\):/, 'python_traceback'],
    [/\bUnhandled(?:Promise)?Rejection\b/i, 'unhandled_rejection'],
    [/\b(?:uncaught exception|uncaught error)\b/i, 'uncaught_exception'],
    [/\b(?:AuthenticationError|ReferenceError|TypeError|SyntaxError|RuntimeError):/i, 'runtime_exception'],
  ];
  for (const [pattern, reason] of patterns) {
    if (pattern.test(output)) return reason;
  }
  return null;
}
