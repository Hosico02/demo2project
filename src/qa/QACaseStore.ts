import path from 'node:path';
import type { QACase, QARegressionSpec } from '../core/types.js';
import { qaCasesPath, regressionSpecPath } from '../utils/paths.js';
import { readJsonSafe, writeJson } from '../utils/json.js';
import { redact } from '../core/redaction.js';
import { nowIso } from '../utils/time.js';

const REGRESSION_VERSION = '1';

const DEFAULT_ASSERTIONS = [
  'missing_validation_after_code_change',
  'supervisor_accepts_unverified_result',
  'repeated_failure_without_root_cause',
  'test_file_created_but_not_runnable',
  'docs_claim_without_evidence',
  'unsafe_command_detected',
  'regression_spec_not_updated_after_failure',
];

/**
 * Persistent storage for QA cases.
 *
 * Two physical locations:
 *  - per-project: <project>/.demo2project/qa-cases.json
 *  - system-level regression spec: <systemRoot>/qa/specs/qa-regression.spec.json
 *
 * Cases are deduped by `fingerprint` (set or strictly merged).
 */
export class QACaseStore {
  constructor(private projectPath: string) {}

  async loadCases(): Promise<QACase[]> {
    const data = await readJsonSafe<QACase[]>(qaCasesPath(this.projectPath));
    return Array.isArray(data) ? data : [];
  }

  async saveCases(cases: QACase[]): Promise<void> {
    const sanitized = cases.map(redactCase);
    await writeJson(qaCasesPath(this.projectPath), sanitized);
  }

  /** Upsert by fingerprint. Returns the merged result. */
  async upsert(newCase: QACase): Promise<QACase> {
    const existing = await this.loadCases();
    const idx = existing.findIndex((c) => c.fingerprint === newCase.fingerprint);
    if (idx === -1) {
      existing.push(redactCase(newCase));
    } else {
      const merged: QACase = {
        ...existing[idx]!,
        ...newCase,
        id: existing[idx]!.id, // keep stable id
        created_at: existing[idx]!.created_at, // keep original create time
        frequency: existing[idx]!.frequency + 1,
        last_seen_at: nowIso(),
        updated_at: nowIso(),
      };
      existing[idx] = redactCase(merged);
    }
    await this.saveCases(existing);
    return existing.find((c) => c.fingerprint === newCase.fingerprint)!;
  }

  async readRegressionSpec(systemRoot: string): Promise<QARegressionSpec> {
    const existing = await readJsonSafe<QARegressionSpec>(regressionSpecPath(systemRoot));
    if (existing && Array.isArray(existing.assertions) && Array.isArray(existing.cases)) {
      // ensure all default assertions are present
      const assertions = Array.from(new Set([...existing.assertions, ...DEFAULT_ASSERTIONS]));
      return { ...existing, assertions };
    }
    return {
      version: REGRESSION_VERSION,
      updated_at: nowIso(),
      assertions: DEFAULT_ASSERTIONS,
      cases: [],
    };
  }

  async writeRegressionSpec(systemRoot: string, spec: QARegressionSpec): Promise<string> {
    const out: QARegressionSpec = {
      ...spec,
      updated_at: nowIso(),
      cases: spec.cases.map(redactCase),
    };
    const p = regressionSpecPath(systemRoot);
    await writeJson(p, out);
    return p;
  }

  static defaultAssertions(): string[] {
    return [...DEFAULT_ASSERTIONS];
  }
}

function redactCase(c: QACase): QACase {
  return {
    ...c,
    title: redact(c.title),
    trigger_condition: redact(c.trigger_condition),
    actual_failure: redact(c.actual_failure),
    expected_behavior: redact(c.expected_behavior),
    reproduction_steps: c.reproduction_steps.map(redact),
    regression_assertions: c.regression_assertions.map(redact),
  };
}
