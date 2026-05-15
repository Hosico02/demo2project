import type {
  AdvisoryAgentRole,
  AdvisoryConfidence,
  AdvisoryFinding,
  AdvisoryReport,
  AdvisoryTaskProposal,
  GapReport,
  IterationPlan,
  ProjectScore,
  ProjectSnapshot,
  Severity,
} from '../../core/types.js';
import type { MarketResearchReport } from '../../research/types.js';
import { nowIso } from '../../utils/time.js';

export const ADVISORY_GATE_POLICY =
  'advisory agents cannot mark product readiness; verifier and scorer remain authoritative';

export interface AdvisoryRequest {
  role: AdvisoryAgentRole;
  projectPath: string;
  goal: string;
  snapshot: ProjectSnapshot;
  score: ProjectScore;
  gap: GapReport;
  plan?: IterationPlan;
  allowNetwork?: boolean;
  marketResearch?: MarketResearchReport | null;
}

export interface AdvisoryProvider {
  readonly name: string;
  readonly model?: string;
  runAdvisory(request: AdvisoryRequest): Promise<AdvisoryReport>;
}

export interface AdvisoryReportInput {
  schema_version?: unknown;
  generated_at?: unknown;
  role?: unknown;
  provider?: unknown;
  model?: unknown;
  gate_policy?: unknown;
  findings?: unknown;
  task_proposals?: unknown;
  risks?: unknown;
  raw_summary?: unknown;
}

export function normalizeAdvisoryReport(
  raw: AdvisoryReportInput,
  defaults: {
    role: AdvisoryAgentRole;
    provider: string;
    model?: string;
  },
): AdvisoryReport {
  return {
    schema_version: 1,
    generated_at: safeString(raw.generated_at) || nowIso(),
    role: isAdvisoryRole(raw.role) ? raw.role : defaults.role,
    provider: safeString(raw.provider) || defaults.provider,
    model: safeString(raw.model) || defaults.model,
    gate_policy: ADVISORY_GATE_POLICY,
    findings: normalizeFindings(raw.findings),
    task_proposals: normalizeTaskProposals(raw.task_proposals),
    risks: normalizeStringArray(raw.risks),
    raw_summary: safeString(raw.raw_summary) || '',
  };
}

function normalizeFindings(value: unknown): AdvisoryFinding[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeFinding(item))
    .filter((item): item is AdvisoryFinding => Boolean(item));
}

function normalizeFinding(value: unknown): AdvisoryFinding | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  const confidence = normalizeConfidence(obj.confidence);
  const sourceUrls = normalizeSourceUrls(obj.source_urls);
  const evidence = normalizeStringArray(obj.evidence);
  if (confidence === 'low') return null;
  if (sourceUrls.length === 0 && evidence.length === 0) return null;
  const category = safeString(obj.category);
  const message = safeString(obj.message);
  const suggestedFix = safeString(obj.suggested_fix);
  if (!category || !message || !suggestedFix) return null;
  return {
    category,
    severity: normalizeSeverity(obj.severity),
    message,
    why_it_matters: safeString(obj.why_it_matters) || 'Model advisory finding requires evidence-backed review.',
    suggested_fix: suggestedFix,
    related_files: normalizeStringArray(obj.related_files),
    confidence,
    source_urls: sourceUrls,
    evidence,
  };
}

function normalizeTaskProposals(value: unknown): AdvisoryTaskProposal[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeTaskProposal(item))
    .filter((item): item is AdvisoryTaskProposal => Boolean(item));
}

function normalizeTaskProposal(value: unknown): AdvisoryTaskProposal | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  const confidence = normalizeConfidence(obj.confidence);
  const sourceUrls = normalizeSourceUrls(obj.source_urls);
  if (confidence === 'low') return null;
  const title = safeString(obj.title);
  const description = safeString(obj.description);
  const verificationCommands = normalizeStringArray(obj.verification_commands);
  if (!title || !description || verificationCommands.length === 0) return null;
  if (sourceUrls.length === 0) return null;
  const acceptanceCriteria = normalizeStringArray(obj.acceptance_criteria);
  return {
    title,
    description,
    acceptance_criteria: acceptanceCriteria.length > 0 ? acceptanceCriteria : ['advisory proposal is implemented with verification'],
    expected_changed_files: normalizeStringArray(obj.expected_changed_files),
    verification_commands: verificationCommands,
    priority: normalizeSeverity(obj.priority),
    confidence,
    source_urls: sourceUrls,
  };
}

function isAdvisoryRole(value: unknown): value is AdvisoryAgentRole {
  return value === 'market_comparator' ||
    value === 'gap_critic' ||
    value === 'planner_critic' ||
    value === 'reviewer_critic';
}

function normalizeSeverity(value: unknown): Severity {
  return value === 'blocker' ||
    value === 'high' ||
    value === 'medium' ||
    value === 'low' ||
    value === 'info'
    ? value
    : 'medium';
}

function normalizeConfidence(value: unknown): AdvisoryConfidence {
  return value === 'high' || value === 'medium' || value === 'low' ? value : 'medium';
}

function normalizeSourceUrls(value: unknown): string[] {
  return normalizeStringArray(value).filter((url) => /^https?:\/\//i.test(url));
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(safeString).filter(Boolean)));
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
