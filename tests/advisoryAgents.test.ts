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
import type { MarketResearchReport } from '../src/research/types.js';

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

function marketResearchReport(projectPath: string): MarketResearchReport {
  return {
    schema_version: 1,
    generated_at: new Date(0).toISOString(),
    project_path: projectPath,
    domain: 'agent_social_deduction_theater',
    query: 'agent werewolf replay evaluation',
    search_provider: 'test',
    copy_policy: 'Do not copy competitor assets.',
    sources: [{
      title: 'Replay docs',
      url: 'https://example.com/replay',
      retrieved_at: new Date(0).toISOString(),
      snippet: 'Mature simulations expose replay and evaluation tooling.',
    }],
    capabilities: [{
      id: 'evaluation_harness',
      label: 'Replay and evaluation harness',
      description: 'Persist transcripts and run repeatable agent simulations.',
      importance: 'required',
      source_urls: ['https://example.com/replay'],
      local_evidence_patterns: ['replay', 'evaluation'],
    }],
    risks: [],
    confidence: 'medium',
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

  it('planner deduplicates equivalent advisory deployment README proposals', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-advisory-plan-deployment-dedupe-'));
    const gap = gapReport(dir);
    gap.findings = [];
    gap.advisory_reports = [
      {
        schema_version: 1,
        generated_at: new Date(0).toISOString(),
        role: 'gap_critic',
        provider: 'mock-advisory',
        model: 'mock',
        gate_policy: 'advisory agents cannot mark product readiness; verifier and scorer remain authoritative',
        findings: [],
        task_proposals: [{
          title: 'Add deployment section to README.md',
          description: 'Document Docker and gunicorn deployment.',
          acceptance_criteria: ['README documents deployment'],
          expected_changed_files: ['README.md'],
          verification_commands: ['grep -i "docker\\|gunicorn" README.md'],
          priority: 'medium',
          confidence: 'medium',
          source_urls: ['https://example.com/deployment'],
        }],
        risks: [],
        raw_summary: 'Deployment docs are needed.',
      },
      {
        schema_version: 1,
        generated_at: new Date(0).toISOString(),
        role: 'reviewer_critic',
        provider: 'mock-advisory',
        model: 'mock',
        gate_policy: 'advisory agents cannot mark product readiness; verifier and scorer remain authoritative',
        findings: [],
        task_proposals: [{
          title: 'Add deployment section to README.md',
          description: 'Document health checks and runtime environment.',
          acceptance_criteria: ['README documents health checks'],
          expected_changed_files: ['README.md'],
          verification_commands: ['grep -i "health\\|environment" README.md'],
          priority: 'medium',
          confidence: 'medium',
          source_urls: ['https://example.com/deployment'],
        }],
        risks: [],
        raw_summary: 'Deployment docs are needed.',
      },
    ];

    const plan = planIteration(gap, 'make deployment docs product-grade', 'iter_advisory_deployment_dedupe');

    expect(plan.tasks.filter((task) => task.title === 'Add deployment section to README.md')).toHaveLength(1);
    expect(plan.advisory_focus.filter((focus) => focus.includes('Add deployment section'))).toHaveLength(1);
  });

  it('planner treats operational docs as covering advisory architecture and operations doc subtasks', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-advisory-plan-ops-docs-dedupe-'));
    const gap = gapReport(dir);
    gap.findings = [{
      id: 'gap-ops-docs',
      category: 'missing_operational_docs',
      severity: 'medium',
      message: 'Missing operational documentation',
      why_it_matters: 'Production operators need startup, deployment and rollback docs.',
      suggested_fix: 'Add architecture and operations docs.',
      related_files: ['docs/architecture.md', 'docs/operations.md'],
    }];
    gap.advisory_reports = [{
      schema_version: 1,
      generated_at: new Date(0).toISOString(),
      role: 'reviewer_critic',
      provider: 'mock-advisory',
      model: 'mock',
      gate_policy: 'advisory agents cannot mark product readiness; verifier and scorer remain authoritative',
      findings: [],
      task_proposals: [
        {
          title: 'Create docs/architecture.md',
          description: 'Create component and data-flow architecture docs.',
          acceptance_criteria: ['architecture docs exist'],
          expected_changed_files: ['docs/architecture.md'],
          verification_commands: ['test -s docs/architecture.md'],
          priority: 'medium',
          confidence: 'medium',
          source_urls: ['https://example.com/architecture'],
        },
        {
          title: 'Create docs/operations.md',
          description: 'Create startup and deployment operations docs.',
          acceptance_criteria: ['operations docs exist'],
          expected_changed_files: ['docs/operations.md'],
          verification_commands: ['test -s docs/operations.md'],
          priority: 'medium',
          confidence: 'medium',
          source_urls: ['https://example.com/operations'],
        },
      ],
      risks: [],
      raw_summary: 'Operational docs are needed.',
    }];

    const plan = planIteration(gap, 'make ops docs product-grade', 'iter_advisory_ops_dedupe');

    expect(plan.tasks.map((task) => task.title)).toContain('Add operational documentation');
    expect(plan.tasks.map((task) => task.title)).not.toContain('Create docs/architecture.md');
    expect(plan.tasks.map((task) => task.title)).not.toContain('Create docs/operations.md');
    expect(plan.advisory_focus).toEqual([]);
  });

  it('planner skips duplicate advisory model-config work and schedules replay evaluation next', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-advisory-plan-dedupe-'));
    const gap = gapReport(dir);
    gap.findings.push({
      id: 'gap-llm-config',
      category: 'missing_user_llm_provider_config',
      severity: 'blocker',
      message: 'LLM demo requires player-supplied model/provider configuration',
      why_it_matters: 'Players should not rely on one server key.',
      suggested_fix: 'Add per-session LLM provider config.',
      related_files: ['llm_config.py', 'app.py', 'templates/index.html'],
    });
    gap.advisory_reports = [
      {
        schema_version: 1,
        generated_at: new Date(0).toISOString(),
        role: 'market_comparator',
        provider: 'mock-advisory',
        model: 'mock',
        gate_policy: 'advisory agents cannot mark product readiness; verifier and scorer remain authoritative',
        findings: [],
        task_proposals: [
          {
            title: 'Close market capability gap: Agent model and provider configuration',
            description: 'Duplicate of the concrete LLM provider config gap.',
            acceptance_criteria: ['model/provider config exists'],
            expected_changed_files: ['llm_config.py', 'tests/test_llm_config.py', 'app.py'],
            verification_commands: ['python3 -m pytest tests/test_llm_config.py -q'],
            priority: 'high',
            confidence: 'high',
            source_urls: ['https://example.com/model-config'],
          },
          {
            title: 'Close market capability gap: Agent evaluation harness',
            description: 'Add seeded replay/evaluation behavior.',
            acceptance_criteria: ['evaluation behavior exists'],
            expected_changed_files: ['evaluation.py', 'replay.py', 'tests/test_eval_harness.py', 'tests/test_replay.py'],
            verification_commands: ['python3 -m pytest tests/test_eval_harness.py tests/test_replay.py -q'],
            priority: 'medium',
            confidence: 'medium',
            source_urls: ['https://example.com/evaluation'],
          },
        ],
        risks: [],
        raw_summary: 'Mature agent products expose model config and evaluation.',
      },
    ];

    const plan = planIteration(gap, 'make it an agent product', 'iter_advisory_dedupe');

    expect(plan.tasks.map((task) => task.title)).toContain('Add player-supplied LLM provider configuration');
    expect(plan.tasks.map((task) => task.title)).toContain('Close market capability gap: Agent evaluation harness');
    expect(plan.tasks.map((task) => task.title)).not.toContain('Close market capability gap: Agent model and provider configuration');
  });

  it('planner skips already-satisfied market advisory tasks instead of burning an iteration slot', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-advisory-plan-satisfied-'));
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.mkdir(path.join(dir, 'docs'), { recursive: true });
    for (const file of ['evaluation.py', 'replay.py', 'tests/test_eval_harness.py', 'tests/test_replay.py', 'docs/agent-evaluation.md', 'README.md', 'package.json']) {
      await fs.writeFile(path.join(dir, file), file === 'package.json' ? '{}' : 'present\n');
    }
    const gap = gapReport(dir);
    gap.advisory_reports = [
      {
        schema_version: 1,
        generated_at: new Date(0).toISOString(),
        role: 'market_comparator',
        provider: 'mock-advisory',
        model: 'mock',
        gate_policy: 'advisory agents cannot mark product readiness; verifier and scorer remain authoritative',
        findings: [],
        task_proposals: [{
          title: 'Close market capability gap: Agent evaluation harness',
          description: 'Already implemented capability should not be re-planned.',
          acceptance_criteria: ['evaluation behavior exists'],
          expected_changed_files: ['evaluation.py', 'replay.py', 'tests/test_eval_harness.py', 'tests/test_replay.py', 'docs/agent-evaluation.md', 'README.md', 'package.json'],
          verification_commands: ['python3 -m pytest tests/test_eval_harness.py tests/test_replay.py -q'],
          priority: 'medium',
          confidence: 'medium',
          source_urls: ['https://example.com/evaluation'],
        }],
        risks: [],
        raw_summary: 'Evaluation is common in mature agent products.',
      },
    ];

    const plan = planIteration(gap, 'make it an agent product', 'iter_advisory_satisfied');

    expect(plan.tasks.map((task) => task.title)).not.toContain('Close market capability gap: Agent evaluation harness');
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

  it('falls back to source-backed market research proposals when advisory JSON cannot be repaired', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-minimax-advisory-market-fallback-'));
    let calls = 0;
    const fetchImpl = async (): Promise<Response> => {
      calls++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              content: calls === 1
                ? 'The project needs replay support, but this is not JSON.'
                : 'Still not JSON after repair.',
            },
          }],
        }),
      } as Response;
    };

    const provider = new MiniMaxAdvisoryProvider({
      enabled: true,
      apiKey: 'test-key',
      fetchImpl,
      model: 'MiniMax-M2.7-highspeed',
    });
    const report = await provider.runAdvisory({
      role: 'market_comparator',
      projectPath: dir,
      goal: 'make the agent theater mature',
      snapshot: {
        ...snapshot(dir),
        detected_language: 'python',
        package_manager: 'pip',
        test_commands: [],
        build_commands: [],
        important_files: ['README.md', 'requirements.txt', 'app.py'],
      },
      score: score(),
      gap: gapReport(dir),
      allowNetwork: true,
      marketResearch: marketResearchReport(dir),
    });

    expect(calls).toBe(2);
    expect(report.risks).toContain('MiniMax advisory output was not parseable JSON');
    expect(report.risks).toContain('fallback_market_research_advisory_used');
    expect(report.task_proposals[0]?.title).toContain('Replay and evaluation harness');
    expect(report.task_proposals[0]?.source_urls).toEqual(['https://example.com/replay']);
    expect(report.task_proposals[0]?.expected_changed_files).toEqual([
      'evaluation.py',
      'replay.py',
      'tests/test_eval_harness.py',
      'tests/test_replay.py',
      'docs/agent-evaluation.md',
      'README.md',
      'package.json',
    ]);
    expect(report.task_proposals[0]?.verification_commands).toEqual(['python3 -m pytest tests/test_eval_harness.py tests/test_replay.py -q']);
  });

  it('falls back to source-backed market research proposals when advisory API calls fail', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-minimax-advisory-api-fallback-'));
    const fetchImpl = async (): Promise<Response> => ({
      ok: false,
      status: 504,
      json: async () => ({}),
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
      goal: 'make the agent theater mature',
      snapshot: {
        ...snapshot(dir),
        detected_language: 'python',
        package_manager: 'pip',
        test_commands: [],
        build_commands: [],
        important_files: ['README.md', 'requirements.txt', 'app.py'],
      },
      score: score(),
      gap: gapReport(dir),
      allowNetwork: true,
      marketResearch: marketResearchReport(dir),
    });

    expect(report.risks).toContain('MiniMax advisory API failed with status 504');
    expect(report.risks).toContain('fallback_market_research_advisory_used');
    expect(report.findings[0]?.source_urls).toEqual(['https://example.com/replay']);
    expect(report.findings[0]?.related_files).toContain('evaluation.py');
    expect(report.task_proposals[0]?.title).toContain('Replay and evaluation harness');
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
