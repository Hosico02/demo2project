import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonSafe } from '../src/utils/json.js';
import { promises as fs } from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

const EXPECTED_CASES = [
  'bad-node-cli',
  'bad-ts-library',
  'bad-react-app',
  'bad-next-app',
  'bad-python-cli',
  'bad-fastapi-api',
  'bad-docs-project',
  'bad-monorepo',
];

interface KnownDefects {
  expected_project_type?: string;
  expected_target_score_after?: number;
  defects: { defect_id?: string; id?: string; category: string; severity: string }[];
  hidden_quality_checks?: unknown[];
}

describe('Benchmark suite invariants', () => {
  it('all expected cases exist with the canonical schema', async () => {
    for (const c of EXPECTED_CASES) {
      const dir = path.join(repoRoot, 'benchmarks', 'public', c);
      const def = await readJsonSafe<KnownDefects>(path.join(dir, 'known_defects.json'));
      expect(def, `${c} known_defects.json`).not.toBeNull();
      expect(Array.isArray(def!.defects), `${c} defects must be an array`).toBe(true);
      expect(def!.expected_project_type, `${c} must declare expected_project_type`).toBeTruthy();
      // evaluation_notes.md present
      const notesStat = await fs.stat(path.join(dir, 'evaluation_notes.md')).catch(() => null);
      expect(notesStat, `${c} missing evaluation_notes.md`).not.toBeNull();
    }
  });

  it('every defect has either defect_id (new schema) or id (legacy)', async () => {
    for (const c of EXPECTED_CASES) {
      const dir = path.join(repoRoot, 'benchmarks', 'public', c);
      const def = await readJsonSafe<KnownDefects>(path.join(dir, 'known_defects.json'));
      for (const d of def!.defects) {
        expect(d.defect_id ?? d.id, `${c} defect missing id`).toBeTruthy();
        expect(d.category, `${c} defect missing category`).toBeTruthy();
        expect(d.severity, `${c} defect missing severity`).toBeTruthy();
      }
    }
  });
});
