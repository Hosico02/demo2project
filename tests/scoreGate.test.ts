import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { takeSnapshot } from '../src/core/projectSnapshot.js';
import { scoreProjectWithEvidence } from '../src/core/evidenceWeightedScorer.js';
import { selectStandardForSnapshot } from '../src/standards/standardsLibrary.js';

async function mk(files: Record<string, string>) {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-score-gate-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content);
  }
  return dir;
}

describe('score gate', () => {
  it('does not convert anti-gaming build penalties into command verification failures', async () => {
    const project = await mk({
      'README.md': '# Demo\n\n## Usage\n\nRun it.\n' + 'x'.repeat(500),
      'package.json': JSON.stringify({ name: 'demo', scripts: { build: 'echo ok', test: 'node --test tests/smoke.test.mjs' } }),
      'tests/smoke.test.mjs': 'import test from "node:test";\nimport assert from "node:assert/strict";\ntest("ok", () => assert.equal(1, 1));\n',
    });
    const snap = await takeSnapshot(project);
    const { standard } = await selectStandardForSnapshot(snap);

    const score = await scoreProjectWithEvidence(snap, standard, { runCommands: false });

    expect(score.anti_gaming_findings?.some((f) => f.detector === 'no_op_script')).toBe(true);
    expect(score.score_gate?.failures.some((f) => f.gate === 'build')).not.toBe(true);
  });

  it('caps score when declared tests fail even if productization files exist', async () => {
    const project = await mk({
      'README.md': '# Demo\n\n## Install\n\n```bash\npython3 -m pytest -q\n```\n\n## Usage\n\nRun the app.\n' + 'x'.repeat(500),
      'pyproject.toml': '[project]\nname = "demo"\n',
      'requirements.txt': 'pytest>=8\nflask>=3\ngunicorn>=22\n',
      'app.py': 'print("ok")\n',
      'Dockerfile': 'FROM python:3.11-slim\n',
      '.env.example': 'OPENAI_API_KEY=\n',
      '.gitignore': '.env\n',
      '.github/workflows/ci.yml': 'name: CI\njobs:\n  test:\n    steps:\n      - run: python3 -m pytest -q\n',
      'tests/test_fail.py': 'def test_fails():\n    assert False\n',
    });
    const snap = await takeSnapshot(project);
    const { standard } = await selectStandardForSnapshot(snap);

    const score = await scoreProjectWithEvidence(snap, standard, { runCommands: true, timeoutMs: 20_000 });

    expect(score.score_gate?.status).toBe('failed');
    expect(score.score_gate?.cap).toBe(49);
    expect(score.total).toBeLessThanOrEqual(49);
    expect(score.notes.join('\n')).toMatch(/score gate.*test command failed/i);
  });

  it('caps score when build/import verification fails', async () => {
    const project = await mk({
      'README.md': '# Demo\n\n## Usage\n\nRun it.\n' + 'x'.repeat(500),
      'pyproject.toml': '[project]\nname = "demo"\n',
      'requirements.txt': 'pytest>=8\n',
      'app.py': 'def broken(:\n',
      'tests/test_smoke.py': 'def test_smoke():\n    assert True\n',
      '.gitignore': '.env\n',
    });
    const snap = await takeSnapshot(project);
    const { standard } = await selectStandardForSnapshot(snap);

    const score = await scoreProjectWithEvidence(snap, standard, { runCommands: true, timeoutMs: 20_000 });

    expect(score.score_gate?.status).toBe('failed');
    expect(score.score_gate?.cap).toBe(39);
    expect(score.total).toBeLessThanOrEqual(39);
    expect(score.notes.join('\n')).toMatch(/score gate.*build command failed/i);
  });
});
