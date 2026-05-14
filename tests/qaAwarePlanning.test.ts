import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { PlannerAgent } from '../src/agents/PlannerAgent.js';
import { SupervisorAgent } from '../src/agents/SupervisorAgent.js';
import { MockAgentProvider } from '../src/agents/providers/MockAgentProvider.js';
import { QACaseStore } from '../src/qa/QACaseStore.js';
import type { GapReport, QACase } from '../src/core/types.js';

function mkCase(over: Partial<QACase> = {}): QACase {
  return {
    id: 'qa_missing_validation',
    title: 'Executor changed files without validation',
    category: 'missing_validation',
    severity: 'high',
    frequency: 3,
    status: 'active',
    project_type: ['generic'],
    bug_source: { iteration_id: 'iter_old', agent: 'qa', source: 'test', related_files: [] },
    trigger_condition: 'changed_files was non-empty with no validation evidence',
    human_flow: [],
    expected_behavior: 'Every code change is followed by verification evidence.',
    actual_failure: 'A previous task changed files without validation.',
    regression_assertions: ['changed files require commands_run and verification_evidence'],
    reproduction_steps: ['run an executor that changes files but skips tests'],
    suggested_test_type: 'workflow_regression',
    fingerprint: 'missing_validation_after_code_change',
    created_at: '2026-05-13T00:00:00.000Z',
    updated_at: '2026-05-13T00:00:00.000Z',
    last_seen_at: '2026-05-13T00:00:00.000Z',
    related_files: [],
    ...over,
  };
}

function gap(): GapReport {
  return {
    project_snapshot: {
      project_path: '/tmp/qa-aware-demo',
      detected_language: 'javascript',
      detected_frameworks: [],
      package_manager: 'npm',
      test_commands: ['npm test'],
      build_commands: ['npm run build'],
      start_commands: ['node app.js'],
      important_files: ['app.js', 'package.json'],
      missing_files: [],
      dependency_summary: { runtime: 0, dev: 0, has_lockfile: false },
      timestamp: '2026-05-13T00:00:00.000Z',
    },
    score: { total: 40, grade: 'working_demo', breakdown: {} as never, notes: [] },
    findings: [{
      id: 'gap-readme',
      category: 'missing_readme',
      severity: 'low',
      message: 'README.md is missing',
      why_it_matters: '',
      suggested_fix: '',
      related_files: ['README.md'],
    }],
    blockers: [],
    recommendations: [],
  };
}

describe('QA-aware planning', () => {
  it('adds applicable QA cases to plan focus and task acceptance criteria', () => {
    const plan = new PlannerAgent().plan(gap(), 'project-ready', 'iter_x', {
      qaCases: [mkCase()],
    });

    expect(plan.qa_focus_cases).toContain('missing_validation_after_code_change');
    expect(plan.tasks[0]!.description).toContain('Known QA guardrails');
    expect(plan.tasks[0]!.description).toContain('missing_validation_after_code_change');
    expect(plan.tasks[0]!.acceptance_criteria).toContain(
      'QA guard missing_validation_after_code_change: changed files require commands_run and verification_evidence',
    );
    expect(plan.tasks[0]!.priority).toBe('high');
  });

  it('feeds persisted preflight QA cases into Supervisor planning', async () => {
    const project = await fs.mkdtemp(path.join(tmpdir(), 'd2p-qa-aware-'));
    await fs.writeFile(path.join(project, 'package.json'), JSON.stringify({ name: 'qa-aware', main: 'app.js' }));
    await fs.writeFile(path.join(project, 'app.js'), 'console.log("demo");\n');
    await new QACaseStore(project).saveCases([mkCase()]);

    const summaries = await new SupervisorAgent().iterate({
      projectPath: project,
      goal: 'project-ready',
      provider: new MockAgentProvider('noop'),
      maxIterations: 1,
    });

    const summary = summaries[0]!;
    expect(summary.iteration_plan.qa_focus_cases).toContain('missing_validation_after_code_change');
    expect(summary.assigned_tasks[0]!.description).toContain('Known QA guardrails');
  });
});
