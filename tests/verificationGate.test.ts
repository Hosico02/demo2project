import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { SupervisorAgent } from '../src/agents/SupervisorAgent.js';
import { ExecutorAgent } from '../src/agents/ExecutorAgent.js';
import { ReviewerAgent } from '../src/agents/ReviewerAgent.js';
import { MockAgentProvider } from '../src/agents/providers/MockAgentProvider.js';
import { runDocsTruth } from '../src/core/docsTruth.js';
import type { AgentResult, AgentTask } from '../src/core/types.js';

async function mkProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-gate-'));
  await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'g', main: 'app.js' }));
  await fs.writeFile(path.join(dir, 'app.js'), 'console.log("hi");\n');
  return dir;
}

function fakeTask(over: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 't',
    iteration_id: 'i',
    assigned_to: 'executor',
    title: 'sample',
    description: 'd',
    acceptance_criteria: ['x'],
    expected_changed_files: ['app.js'],
    verification_commands: [],
    priority: 'high',
    status: 'pending',
    ...over,
  };
}

describe('Verification Gate — 5 conditions', () => {
  it('condition 1: changed_files non-empty + no commands_run + no unable_to_verify_reason → status downgraded to failed', async () => {
    const ex = new ExecutorAgent(new MockAgentProvider('change_without_verify'));
    const r = await ex.execute(fakeTask({ verification_commands: [] }), {
      project_path: '/tmp',
      iteration_id: 'i',
      recent_events: [],
    });
    expect(r.status).toBe('failed');
    expect(r.failures.some((f) => /policy_violation/.test(f))).toBe(true);
  });

  it('condition 2: Supervisor never marks completed without verification_evidence', async () => {
    const demo = await mkProject();
    const sup = new SupervisorAgent();
    const summaries = await sup.iterate({
      projectPath: demo,
      goal: 'gate',
      provider: new MockAgentProvider('change_without_verify'),
      maxIterations: 1,
    });
    const completed = summaries[0]!.executor_results.filter((r) => r.status === 'completed');
    for (const c of completed) {
      // either evidence exists OR an explicit unable_to_verify_reason
      const hasEvidence = c.verification_evidence.length > 0;
      const hasReason = !!c.unable_to_verify_reason;
      expect(hasEvidence || hasReason || c.changed_files.length === 0).toBe(true);
    }
  });

  it('condition 3: same command failing repeatedly produces a QA case', async () => {
    // simulate by running iterate with a provider that flips between modes
    // The QA detector requires verification_failed events with the same command;
    // we exercise the detector directly to keep this test deterministic.
    const { generateCasesFromEvents } = await import('../src/qa/QACaseGenerator.js');
    const evs = [
      { id: '1', iteration_id: 'i', timestamp: 't', agent: 'verifier' as const, event_type: 'verification_failed' as const, severity: 'high' as const, message: 'failed', command: 'pnpm test', metadata: {} },
      { id: '2', iteration_id: 'i', timestamp: 't', agent: 'verifier' as const, event_type: 'verification_failed' as const, severity: 'high' as const, message: 'failed', command: 'pnpm test', metadata: {} },
    ];
    const cases = generateCasesFromEvents(evs as any, 'i');
    expect(cases.some((c) => /repeated_failure_without_root_cause/.test(c.fingerprint))).toBe(true);
  });

  it('condition 4: test file created but no test runner observed is detectable', async () => {
    // workflowAssertions.test_file_created_but_not_runnable scans summaries
    const { WORKFLOW_ASSERTIONS } = await import('../src/qa/workflowAssertions.js');
    const summaries = [
      {
        iteration_id: 'i',
        changed_files: ['tests/smoke.test.ts'],
        verification_results: [],
      },
    ] as any;
    const r = WORKFLOW_ASSERTIONS.test_file_created_but_not_runnable!({ events: [], summaries });
    expect(r.passed).toBe(false);
  });

  it('condition 5: docs claim without evidence is detectable via DocsTruthChecker', async () => {
    const dir = await mkProject();
    await fs.writeFile(path.join(dir, 'README.md'), '## Run\n\n```\npnpm test\n```\n');
    // package.json above does not have a test script
    const r = await runDocsTruth(dir);
    expect(r.missing).toBeGreaterThan(0);
    expect(r.results.some((x) => x.kind === 'script' && x.detail === 'test')).toBe(true);
  });

  it('ReviewerAgent: flags inconsistent_status when failures present but status=completed', () => {
    const reviewer = new ReviewerAgent();
    const findings = reviewer.review(
      fakeTask(),
      {
        task_id: 't',
        agent: 'executor',
        status: 'completed',
        summary: 'x',
        changed_files: ['app.js'],
        commands_run: ['pnpm test'],
        verification_evidence: [{
          command: 'pnpm test',
          exit_code: 0,
          stdout_summary: '',
          stderr_summary: '',
          passed: true,
          duration_ms: 1,
        }],
        failures: ['something broke'],
        risks: [],
        next_steps: [],
      } as AgentResult,
    );
    expect(findings.some((f) => f.rule === 'inconsistent_status')).toBe(true);
  });
});
