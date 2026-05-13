import path from 'node:path';
import { ensureDir, writeText, readTextSafe } from '../../utils/fs.js';
import { writeJson, readJsonSafe } from '../../utils/json.js';
import { nowIso } from '../../utils/time.js';
import { REPORT_SCHEMA_VERSION, pathHash } from './ReportTemplate.js';
import type { ReportDocument } from './ReportTemplate.js';
import { render } from './ReportRenderer.js';
import type { ReportFormat } from './ReportRenderer.js';
import { AnalyzerAgent } from '../../agents/AnalyzerAgent.js';
import { buildTrustReport } from '../../governance/TrustReport.js';
import { buildThreatModel } from '../../security/ThreatModel.js';

export type ReportType =
  | 'project-report'
  | 'gap-report'
  | 'qa-report'
  | 'trust-report'
  | 'security-report'
  | 'evaluation-report'
  | 'generalization-report'
  | 'autonomy-report'
  | 'incident-report'
  | 'workspace-report'
  | 'self-check-report';

export const REPORT_TYPES: ReportType[] = [
  'project-report', 'gap-report', 'qa-report', 'trust-report', 'security-report',
  'evaluation-report', 'generalization-report', 'autonomy-report', 'incident-report',
  'workspace-report', 'self-check-report',
];

function reportsDir(systemRoot: string): string {
  return path.join(systemRoot, 'reports');
}

export async function writeReport(systemRoot: string, doc: ReportDocument, formats: ReportFormat[] = ['markdown', 'json']): Promise<{ paths: Record<string, string> }> {
  const dir = path.join(reportsDir(systemRoot), doc.type);
  await ensureDir(dir);
  const paths: Record<string, string> = {};
  for (const f of formats) {
    const ext = f === 'json' ? 'json' : f === 'html' ? 'html' : 'md';
    const p = path.join(dir, `report.${ext}`);
    const out = render(doc, f);
    if (f === 'json') await writeJson(p, JSON.parse(out));
    else await writeText(p, out);
    paths[f] = p;
  }
  return { paths };
}

export async function readReport(reportPath: string): Promise<ReportDocument | null> {
  return readJsonSafe<ReportDocument>(reportPath);
}

export async function renderToHtml(reportJsonPath: string, outPath: string): Promise<{ written: string }> {
  const doc = await readJsonSafe<ReportDocument>(reportJsonPath);
  if (!doc) throw new Error(`cannot read report: ${reportJsonPath}`);
  await writeText(outPath, render(doc, 'html'));
  return { written: outPath };
}

export async function projectReport(systemRoot: string, projectPath: string): Promise<ReportDocument> {
  const analyzer = new AnalyzerAgent();
  const { snapshot, score, gap } = await analyzer.fullAnalyze(projectPath);
  const findings = gap.findings.slice(0, 50).map((g) => ({
    id: g.id,
    title: g.message,
    severity: g.severity as 'low' | 'medium' | 'high' | 'critical',
    description: g.why_it_matters,
    evidence: g.suggested_fix,
  }));
  return {
    schema_version: REPORT_SCHEMA_VERSION,
    type: 'project-report',
    title: `Project report — ${path.basename(projectPath)}`,
    generated_at: nowIso(),
    project_path_hash: pathHash(projectPath),
    summary: `Score ${score.total}/100 (${score.grade}); language=${snapshot.detected_language}; ${gap.findings.length} gap(s).`,
    findings,
    evidence_summary: [],
    risk_summary: [{ level: gap.blockers.length > 0 ? 'high' : 'medium', label: `${gap.blockers.length} blocker(s)` }],
    recommendations: gap.recommendations,
    next_steps: [
      'pnpm demo2project iterate --project <path> --provider rule-based --max-iterations 1',
      'pnpm demo2project trust:check --project <path>',
    ],
    limitations: [
      'project-report does not run code; verification is left to iterate/QA preflight.',
    ],
    raw_refs: [],
  };
}

export async function securityReport(systemRoot: string, projectPath?: string): Promise<ReportDocument> {
  const trust = await buildTrustReport(systemRoot, projectPath);
  const tm = buildThreatModel();
  const findings = tm.aggregate.top.map((t) => ({
    id: t.id,
    title: `Top threat ${t.id}`,
    severity: t.risk_level as 'low' | 'medium' | 'high' | 'critical',
    description: `residual ${t.residual_score} (raw ${t.raw_score})`,
  }));
  return {
    schema_version: REPORT_SCHEMA_VERSION,
    type: 'security-report',
    title: 'Security report',
    generated_at: nowIso(),
    project_path_hash: projectPath ? pathHash(projectPath) : undefined,
    summary: `Trust score ${trust.trust_score}/100; ${trust.open_incidents} open incident(s); ${trust.open_policy_violations} violation(s); audit chain ${trust.audit_log_integrity.ok ? 'ok' : 'BROKEN'}.`,
    findings,
    evidence_summary: [`Threat model: ${tm.total_threats} threats; readiness ${tm.aggregate.trust_readiness_score}/100`],
    risk_summary: [{ level: trust.trust_score < 50 ? 'high' : 'medium', label: `trust score ${trust.trust_score}` }],
    recommendations: trust.recommendations,
    next_steps: ['pnpm demo2project audit:verify', 'pnpm demo2project trust:report'],
    limitations: [
      'Plugin/MCP scans are advisory; they do not sandbox runtime.',
      'NetworkGuard is policy-level only; not OS-level isolation.',
    ],
    raw_refs: [],
  };
}

export async function trustReport(systemRoot: string, projectPath?: string): Promise<ReportDocument> {
  const trust = await buildTrustReport(systemRoot, projectPath);
  return {
    schema_version: REPORT_SCHEMA_VERSION,
    type: 'trust-report',
    title: 'Trust report',
    generated_at: nowIso(),
    project_path_hash: projectPath ? pathHash(projectPath) : undefined,
    summary: `Trust score ${trust.trust_score}/100; privacy=${trust.privacy_mode}; autonomy=${trust.autonomy_level}; emergency_stop=${trust.emergency_stop_active}.`,
    findings: [],
    evidence_summary: [
      `audit chain ${trust.audit_log_integrity.ok ? 'ok' : 'BROKEN'} (${trust.audit_log_integrity.total} events)`,
      `${trust.open_incidents} open incidents`,
      `${trust.approval_queue} pending approvals`,
    ],
    risk_summary: [{ level: trust.trust_score < 50 ? 'high' : 'medium', label: `trust ${trust.trust_score}/100` }],
    recommendations: trust.recommendations,
    next_steps: ['pnpm demo2project policy:violations --project <path>', 'pnpm demo2project incident:list'],
    limitations: ['Trust score is a heuristic; review evidence directly for high-stakes decisions.'],
    raw_refs: [],
  };
}

export async function listReports(systemRoot: string): Promise<{ type: string; paths: string[] }[]> {
  const root = reportsDir(systemRoot);
  const out: { type: string; paths: string[] }[] = [];
  for (const t of REPORT_TYPES) {
    const dir = path.join(root, t);
    const files = await safeList(dir);
    if (files.length > 0) out.push({ type: t, paths: files.map((f) => path.join(dir, f)) });
  }
  return out;
}

async function safeList(dir: string): Promise<string[]> {
  try {
    const { promises: fs } = await import('node:fs');
    return await fs.readdir(dir);
  } catch { return []; }
}

void readTextSafe;
