import type { IterationEvent, IterationSummary, QAAssertionResult, QARegressionSpec } from '../core/types.js';
import { WORKFLOW_ASSERTIONS } from './workflowAssertions.js';
import { EventStore } from '../core/eventStore.js';
import { iterationsDir } from '../utils/paths.js';
import { readJsonSafe } from '../utils/json.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface RegressionRunResult {
  project_path: string;
  total: number;
  passed: number;
  failed: number;
  results: QAAssertionResult[];
}

/**
 * Run a regression spec against a project's recorded iteration history.
 *
 * Loads:
 *   - all iteration events from <project>/.demo2project/events/*.jsonl
 *   - all iteration summaries from <project>/.demo2project/iterations/*.json
 *
 * Then executes the assertions named in `spec.assertions`.
 */
export async function runRegression(
  projectPath: string,
  spec: QARegressionSpec,
): Promise<RegressionRunResult> {
  const store = new EventStore(projectPath);
  const events = await store.readAll();
  const summaries = await loadSummaries(projectPath);

  const results: QAAssertionResult[] = [];
  for (const name of spec.assertions) {
    const fn = WORKFLOW_ASSERTIONS[name];
    if (!fn) {
      results.push({
        assertion: name,
        passed: false,
        message: `assertion not implemented: ${name}`,
        related_events: [],
      });
      continue;
    }
    results.push(fn({ events, summaries }));
  }
  return {
    project_path: projectPath,
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    results,
  };
}

async function loadSummaries(projectPath: string): Promise<IterationSummary[]> {
  const dir = iterationsDir(projectPath);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  const out: IterationSummary[] = [];
  for (const f of entries.filter((e) => e.endsWith('.json'))) {
    const s = await readJsonSafe<IterationSummary>(path.join(dir, f));
    if (s) out.push(s);
  }
  return out;
}
