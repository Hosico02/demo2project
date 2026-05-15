import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { ModelAdvisoryAgent } from '../src/agents/advisory/ModelAdvisoryAgent.js';
import { MiniMaxAdvisoryProvider } from '../src/agents/advisory/MiniMaxAdvisoryProvider.js';
import { MockAdvisoryProvider } from '../src/agents/advisory/MockAdvisoryProvider.js';
import { planIteration } from '../src/core/iterationPlanner.js';
import type { GapReport, ProjectSnapshot, ProjectScore } from '../src/core/types.js';
import type { AdvisoryProvider, AdvisoryRequest } from '../src/agents/advisory/AdvisoryProvider.js';

function snapshot(projectPath: string): ProjectSnapshot {
  return {
    project_path: projectPath,
    detected_language: 'javascript',
    detected_frameworks: ['vite'],
    package_manager: 'npm',
    test_commands: ['npm test'],
    build_commands: ['npm run build'],
    start_commands: ['npm start'],
    important_files: ['package.json', 'src/App.js'],
    missing_files: [],
    dependency_summary: { runtime: 1, dev: 1, has_lockfile: false },
    timestamp: new Date(0).toISOString(),
  };
}

function score(): ProjectScore {
  return {
    total: 72,
    grade: 'project_ready_candidate',
    breakdown: {
      structure_score: 8,
      test_score: 10,
      build_score: 10,
      runtime_score: 8,
      docs_score: 8,
      config_score: 6,
      maintainability_score: 8,
      safety_score: 6,
      agent_process_score: 8,
    },
    notes: [],
  };
}

function gapReport(projectPath: string): GapReport {
  return {
    project_snapshot: snapshot(projectPath),
    score: score(),
    findings: [
      {
        id: 'gap-a',
        category: 'thin_readme',
        severity: 'medium',
        message: 'README is thin',
        why_it_matters: 'Docs are incomplete.',
        suggested_fix: 'Expand README.',
        related_files: ['README.md'],
      },
      {
        id: 'gap-b',
        category: 'missing_env_example',
        severity: 'low',
        message: 'Missing .env.example',
        why_it_matters: 'Config docs are incomplete.',
        suggested_fix: 'Add .env.example.',
        related_files: ['.env.example'],
      },
      {
        id: 'gap-c',
        category: 'missing_required_command',
        severity: 'high',
        message: 'Missing required command: build',
        why_it_matters: 'Build must be repeatable.',
        suggested_fix: 'Add build script.',
        related_files: ['package.json'],
      },
      {
        id: 'gap-d',
        category: 'no_tests',
        severity: 'blocker',
        message: 'No tests found',
        why_it_matters: 'No verification exists.',
        suggested_fix: 'Add tests.',
        related_files: ['tests'],
      },
    ],
    blockers: [],
    recommendations: [],
  };
}

describe('model-backed advisory agents', () => {
  it('normalizes model advice into source-backed findings and task proposals', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-advisory-normalize-'));
    const provider = new MockAdvisoryProvider({
      findings: [
        {
          category: 'market_missing_onboarding',
          severity: 'high',
          message: 'Mature competitors expose guided first-run onboarding.',
          why_it_matters: 'Users need a path from blank project to first useful result.',
          suggested_fix: 'Add a verified onboarding workflow.',
          related_files: ['src/App.js'],
          confidence: 'high',
          source_urls: ['https://example.com/product/onboarding'],
          evidence: ['competitor onboarding docs'],
        },
        {
          category: 'unsourced_guess',
          severity: 'high',
          message: 'This should be filtered.',
          why_it_matters: 'No evidence.',
          suggested_fix: 'Do not accept.',
          related_files: [],
          confidence: 'low',
          source_urls: [],
          evidence: [],
        },
      ],
      task_proposals: [
        {
          title: 'Implement guided onboarding workflow',
          description: 'Add a behavior-level onboarding path from empty state to first successful run.',
          acceptance_criteria: ['onboarding workflow is reachable', 'tests cover the workflow'],
          expected_changed_files: ['src/onboarding.js', 'tests/onboarding.test.js'],
          verification_commands: ['npm test -- onboarding'],
          priority: 'high',
          confidence: 'high',
          source_urls: ['https://example.com/product/onboarding'],
        },
      ],
    });

    const report = await new ModelAdvisoryAgent(provider).run('market_comparator', {
      projectPath: dir,
      goal: 'make it a product',
      snapshot: snapshot(dir),
      score: score(),
      gap: gapReport(dir),
      allowNetwork: true,
    });

    expect(report.role).toBe('market_comparator');
    expect(report.findings.map((finding) => finding.category)).toEqual(['market_missing_onboarding']);
    expect(report.task_proposals[0]?.title).toBe('Implement guided onboarding workflow');
    expect(report.gate_policy).toContain('advisory agents cannot mark product readiness');
  });

  it('planner reserves one task slot for high-confidence advisory proposals', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-advisory-plan-'));
    const gap = gapReport(dir);
    gap.advisory_reports = [
      {
        schema_version: 1,
        generated_at: new Date(0).toISOString(),
        role: 'planner_critic',
        provider: 'mock-advisory',
        model: 'mock',
        gate_policy: 'advisory agents cannot mark product readiness; verifier and scorer remain authoritative',
        findings: [],
        task_proposals: [
          {
            title: 'Implement behavior-level product flow',
            description: 'Replace placeholder product shell with a user-reachable workflow.',
            acceptance_criteria: ['workflow is reachable from the runtime entry', 'test covers the workflow'],
            expected_changed_files: ['src/product-flow.js', 'tests/product-flow.test.js'],
            verification_commands: ['npm test -- product-flow'],
            priority: 'high',
            confidence: 'high',
            source_urls: ['https://example.com/mature-product'],
          },
        ],
        risks: [],
        raw_summary: 'Competitor products expose behavior-level workflows.',
      },
    ];

    const plan = planIteration(gap, 'make it a product', 'iter_advisory');

    expect(plan.tasks).toHaveLength(4);
    expect(plan.tasks.map((task) => task.title)).toContain('Implement behavior-level product flow');
    const advisoryTask = plan.tasks.find((task) => task.title === 'Implement behavior-level product flow')!;
    expect(advisoryTask.description).toContain('Advisory source');
    expect(plan.advisory_focus).toContain('planner_critic: Implement behavior-level product flow');
  });

  it('MiniMax advisory provider parses strict JSON and does not edit project files', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-minimax-advisory-'));
    await fs.writeFile(path.join(dir, 'app.js'), 'console.log("demo");\n');
    const fetchImpl = async (): Promise<Response> => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              raw_summary: 'Competitor products have onboarding.',
              findings: [{
                category: 'market_missing_onboarding',
                severity: 'high',
                message: 'Missing onboarding',
                why_it_matters: 'Mature products guide first run.',
                suggested_fix: 'Add onboarding flow.',
                related_files: ['app.js'],
                confidence: 'high',
                source_urls: ['https://example.com/onboarding'],
                evidence: ['source says onboarding matters'],
              }],
              task_proposals: [{
                title: 'Add onboarding flow',
                description: 'Create a first-run path.',
                acceptance_criteria: ['first-run path works'],
                expected_changed_files: ['app.js', 'tests/onboarding.test.js'],
                verification_commands: ['npm test -- onboarding'],
                priority: 'high',
                confidence: 'high',
                source_urls: ['https://example.com/onboarding'],
              }],
              risks: ['Do not copy competitor text.'],
            }),
          },
        }],
      }),
    } as Response);

    const provider = new MiniMaxAdvisoryProvider({
      enabled: true,
      apiKey: 'test-key',
      fetchImpl,
      model: 'MiniMax-M2.7-highspeed',
    });
    const report = await provider.runAdvisory({
      role: 'market_comparator',
      projectPath: dir,
      goal: 'make it product-ready',
      snapshot: snapshot(dir),
      score: score(),
      gap: gapReport(dir),
      allowNetwork: true,
    });

    expect(report.provider).toBe('minimax-advisory');
    expect(report.model).toBe('MiniMax-M2.7-highspeed');
    expect(report.findings[0]?.category).toBe('market_missing_onboarding');
    expect(await fs.readFile(path.join(dir, 'app.js'), 'utf8')).toBe('console.log("demo");\n');
  });

  it('MiniMax advisory provider repairs prose-wrapped non-JSON advisory output', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-minimax-advisory-repair-'));
    let calls = 0;
    let repairPrompt = '';
    const fetchImpl = async (_url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      calls++;
      const body = JSON.parse(String(init?.body));
      if (calls === 2) {
        repairPrompt = body.messages.find((message: { role: string }) => message.role === 'user')?.content ?? '';
      }
      const content = calls === 1
        ? 'Here is the critique:\nraw_summary: missing JSON object'
        : JSON.stringify({
          raw_summary: 'Source-backed agent theater product gaps.',
          findings: [{
            category: 'agent_theater_eval_gap',
            severity: 'high',
            message: 'Missing repeatable agent evaluation loop',
            why_it_matters: 'Agent-facing products need deterministic regression evidence.',
            suggested_fix: 'Add replay/evaluation harness.',
            related_files: ['game.py'],
            confidence: 'high',
            source_urls: ['https://example.com/agent-evaluation'],
            evidence: [],
          }],
          task_proposals: [],
          risks: [],
        });
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content } }] }),
      } as Response;
    };

    const provider = new MiniMaxAdvisoryProvider({
      enabled: true,
      apiKey: 'test-key',
      fetchImpl,
      model: 'MiniMax-M2.7-highspeed',
    });
    const report = await provider.runAdvisory({
      role: 'gap_critic',
      projectPath: dir,
      goal: 'keep the agent-facing werewolf premise',
      snapshot: snapshot(dir),
      score: score(),
      gap: gapReport(dir),
      allowNetwork: true,
    });

    expect(calls).toBe(2);
    expect(repairPrompt).toContain('Previous advisory response was not parseable JSON');
    expect(report.findings[0]?.category).toBe('agent_theater_eval_gap');
    expect(report.risks).not.toContain('MiniMax advisory output was not parseable JSON');
  });

  it('runs independent advisory roles in parallel', async () => {
    let active = 0;
    let maxActive = 0;
    const provider: AdvisoryProvider = {
      name: 'slow-advisory',
      model: 'mock',
      async runAdvisory(request: AdvisoryRequest) {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 25));
        active--;
        return new MockAdvisoryProvider({ raw_summary: request.role }).runAdvisory(request);
      },
    };

    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-advisory-parallel-'));
    const reports = await new ModelAdvisoryAgent(provider).runMany(
      ['market_comparator', 'gap_critic', 'planner_critic', 'reviewer_critic'],
      {
        projectPath: dir,
        goal: 'make it product-ready',
        snapshot: snapshot(dir),
        score: score(),
        gap: gapReport(dir),
        allowNetwork: true,
      },
    );

    expect(reports).toHaveLength(4);
    expect(maxActive).toBeGreaterThan(1);
  });
});
