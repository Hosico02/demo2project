import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AnalyzerAgent } from '../agents/AnalyzerAgent.js';
import { QACaseStore } from '../qa/QACaseStore.js';
import { buildTrustReport } from '../governance/TrustReport.js';
import { evaluateTrust } from '../security/untrusted/RepositoryTrustEvaluator.js';
import { check as policyCheck } from '../security/policy/SecurityPolicyEngine.js';
import { ConfigManager } from '../product/config/ConfigManager.js';
import { applyProfile } from '../product/config/ConfigProfiles.js';
import type { SDKOptions, AnalysisResult, GapResult, PreflightResult, TrustResult, SDKProfile } from './types.js';

function defaultSystemRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

export class Demo2ProjectClient {
  readonly systemRoot: string;
  readonly projectPath?: string;
  readonly profile: SDKProfile;

  constructor(opts: SDKOptions = {}) {
    this.systemRoot = opts.systemRoot ?? defaultSystemRoot();
    this.projectPath = opts.projectPath;
    this.profile = opts.profile ?? 'conservative';
  }

  async analyze(): Promise<AnalysisResult> {
    if (!this.projectPath) throw new Error('projectPath required for analyze');
    const a = new AnalyzerAgent();
    const r = await a.fullAnalyze(this.projectPath);
    return {
      score: r.score.total,
      grade: r.score.grade,
      language: r.snapshot.detected_language,
      package_manager: r.snapshot.package_manager,
      findings: r.gap.findings.length,
      blockers: r.gap.blockers.length,
    };
  }

  async gap(): Promise<GapResult> {
    if (!this.projectPath) throw new Error('projectPath required');
    const a = new AnalyzerAgent();
    const r = await a.fullAnalyze(this.projectPath);
    return {
      findings: r.gap.findings.map((g) => ({ id: g.id, severity: g.severity, message: g.message })),
      blockers: r.gap.blockers.map((g) => ({ id: g.id, severity: g.severity, message: g.message })),
      recommendations: r.gap.recommendations,
    };
  }

  qa = {
    preflight: async (): Promise<PreflightResult> => {
      if (!this.projectPath) throw new Error('projectPath required');
      const store = new QACaseStore(this.projectPath);
      const cases = await store.loadCases();
      return { total_cases: cases.length, active_cases: cases.filter((c) => c.status === 'active').length };
    },
  };

  security = {
    trustReport: async (): Promise<TrustResult> => {
      const r = await buildTrustReport(this.systemRoot, this.projectPath);
      return {
        trust_score: r.trust_score,
        open_incidents: r.open_incidents,
        audit_log_integrity_ok: r.audit_log_integrity.ok,
        recommendations: r.recommendations,
      };
    },
    trustCheck: async () => {
      if (!this.projectPath) throw new Error('projectPath required');
      return evaluateTrust(this.projectPath);
    },
    policyCheck: async (req: { action: 'command_execution' | 'file_write' | 'file_read'; command?: string; target_path?: string }) => {
      return policyCheck(this.systemRoot, { action: req.action as never, actor: 'sdk', command: req.command, target_path: req.target_path });
    },
  };

  config = {
    effective: async () => {
      const cm = new ConfigManager(this.systemRoot);
      return cm.loadEffective(this.projectPath);
    },
    applyProfile: async () => {
      const cm = new ConfigManager(this.systemRoot);
      const cur = await cm.loadEffective(this.projectPath);
      const next = applyProfile(cur.config, this.profile);
      if (this.projectPath) await cm.saveProject(this.projectPath, next);
      else await cm.saveSystem(next);
      return next;
    },
  };
}
