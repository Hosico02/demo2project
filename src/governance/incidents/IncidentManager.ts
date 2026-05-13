import path from 'node:path';
import { promises as fs } from 'node:fs';
import { ensureDir, writeText } from '../../utils/fs.js';
import { writeJson, readJsonSafe } from '../../utils/json.js';
import { nowIso, shortId } from '../../utils/time.js';
import { redact } from '../../core/redaction.js';
import { append as auditAppend } from '../audit/AuditLog.js';
import type { Incident, IncidentType } from './IncidentReport.js';
import { classifySeverity, shouldTriggerEmergencyStop } from './IncidentClassifier.js';
import { stop as emergencyStop } from './EmergencyStop.js';

function incidentsDir(systemRoot: string): string {
  return path.join(systemRoot, '.demo2project', 'governance', 'incidents');
}

export interface CreateIncidentInput {
  type: IncidentType;
  summary: string;
  findings: string[];
  affected_project?: string;
  affected_session?: string;
  evidence_ids?: string[];
  policy_violations?: string[];
  suspected_root_cause?: string;
}

export class IncidentManager {
  constructor(private readonly systemRoot: string) {}

  async create(input: CreateIncidentInput): Promise<Incident> {
    const severity = classifySeverity(input.type);
    const i: Incident = {
      id: shortId('inc'),
      type: input.type,
      severity,
      status: 'open',
      detected_at: nowIso(),
      affected_project: input.affected_project,
      affected_session: input.affected_session,
      summary: redact(input.summary),
      findings: input.findings.map((f) => redact(f)),
      evidence_ids: input.evidence_ids ?? [],
      policy_violations: input.policy_violations ?? [],
      suspected_root_cause: input.suspected_root_cause,
      containment_actions: [],
      recommended_human_actions: this.defaultActionsFor(input.type),
    };
    const dir = incidentsDir(this.systemRoot);
    await ensureDir(dir);
    await writeJson(path.join(dir, `${i.id}.json`), i);
    await writeText(path.join(dir, `${i.id}.md`), this.toMarkdown(i));
    await auditAppend(this.systemRoot, {
      actor: 'incident_manager',
      action: `incident:open:${i.type}`,
      target: i.id,
      decision: 'open',
      risk_level: i.severity,
      incident_id: i.id,
      metadata: { summary: i.summary, project: i.affected_project },
    });
    if (shouldTriggerEmergencyStop(i)) {
      await emergencyStop(this.systemRoot, 'incident_manager', `auto-stop on incident ${i.id}`, i.id);
      i.containment_actions.push('emergency_stop_activated');
      await writeJson(path.join(dir, `${i.id}.json`), i);
    }
    return i;
  }

  async list(): Promise<Incident[]> {
    const dir = incidentsDir(this.systemRoot);
    let entries: string[] = [];
    try { entries = await fs.readdir(dir); } catch { return []; }
    const out: Incident[] = [];
    for (const f of entries.filter((e) => e.endsWith('.json'))) {
      const r = await readJsonSafe<Incident>(path.join(dir, f));
      if (r) out.push(r);
    }
    return out.sort((a, b) => a.detected_at.localeCompare(b.detected_at));
  }

  async get(id: string): Promise<Incident | null> {
    return readJsonSafe<Incident>(path.join(incidentsDir(this.systemRoot), `${id}.json`));
  }

  async resolve(id: string, reason: string): Promise<Incident | null> {
    const i = await this.get(id);
    if (!i) return null;
    i.status = 'resolved';
    i.resolved_at = nowIso();
    i.containment_actions.push(`resolved: ${reason}`);
    await writeJson(path.join(incidentsDir(this.systemRoot), `${id}.json`), i);
    await auditAppend(this.systemRoot, {
      actor: 'incident_manager',
      action: 'incident:resolve',
      target: id,
      decision: 'resolved',
      risk_level: i.severity,
      incident_id: id,
      metadata: { reason },
    });
    return i;
  }

  private defaultActionsFor(t: IncidentType): string[] {
    const map: Partial<Record<IncidentType, string[]>> = {
      secret_exposure: ['rotate exposed credential', 'audit recent commits', 'redact persisted artifacts'],
      unsafe_command_attempt: ['review attempting actor', 'inspect command context', 'add to CommandGuard if novel'],
      prompt_injection_detected: ['quarantine affected repo', 'sanitize context blocks', 'review related QA cases'],
      malicious_repo_detected: ['quarantine repo', 'review all related sessions', 'consider deletion'],
      policy_violation: ['triage policy violation', 'update policy or actor permissions'],
      approval_bypass_attempt: ['investigate code path', 'add guard rail'],
      audit_log_tampering: ['preserve current log', 'forensic review', 'rotate secrets'],
      self_modification_violation: ['inspect hypothesis source', 'reaffirm forbidden_self_modifications'],
      network_exfiltration_attempt: ['investigate destination', 'rotate credentials'],
      supply_chain_risk: ['review dependency diff', 'pin or revert', 'audit lockfile'],
      qa_memory_poisoning: ['review recent QA cases', 'roll back imports'],
      rollback_failure: ['manual restore from snapshot', 'fix workspace base_commit handling'],
    };
    return map[t] ?? ['investigate', 'document'];
  }

  private toMarkdown(i: Incident): string {
    return `# Incident ${i.id}\n\n- Type: ${i.type}\n- Severity: ${i.severity}\n- Status: ${i.status}\n- Detected: ${i.detected_at}\n- Project: ${i.affected_project ?? '—'}\n\n## Summary\n\n${i.summary}\n\n## Findings\n${i.findings.map((f) => `- ${f}`).join('\n')}\n\n## Recommended actions\n${i.recommended_human_actions.map((a) => `- ${a}`).join('\n')}\n`;
  }
}
