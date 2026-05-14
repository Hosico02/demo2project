import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { takeSnapshot } from '../src/core/projectSnapshot.js';
import { scoreProject, scoreTotalFromBreakdown } from '../src/core/projectScorer.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const badDemo = path.join(repoRoot, 'examples', 'bad-demo');

describe('projectScorer', () => {
  it('scores bad-demo well below the repo itself', async () => {
    const badSnap = await takeSnapshot(badDemo);
    const goodSnap = await takeSnapshot(repoRoot);
    const badScore = await scoreProject(badSnap);
    const goodScore = await scoreProject(goodSnap);
    expect(badScore.total).toBeLessThan(goodScore.total);
    expect(badScore.grade).toMatch(/raw_demo|working_demo/);
  });

  it('produces breakdown that sums approximately to total', async () => {
    const snap = await takeSnapshot(repoRoot);
    const score = await scoreProject(snap);
    const sum = Object.values(score.breakdown).reduce((a, b) => a + b, 0);
    expect(Math.round(sum)).toBe(score.total);
  });

  it('applies custom scoring rule weights to the total', () => {
    const total = scoreTotalFromBreakdown(
      {
        structure_score: 0,
        test_score: 0,
        build_score: 0,
        runtime_score: 0,
        docs_score: 10,
        config_score: 0,
        maintainability_score: 0,
        safety_score: 0,
        agent_process_score: 0,
      },
      {
        required_files: [],
        recommended_files: [],
        required_commands: [],
        quality_gates: [],
        scoring_rules: [{ dimension: 'docs_score', weight: 100 }],
        forbidden_patterns: [],
        verification_policy: {
          require_evidence_when_files_changed: true,
          max_command_timeout_ms: 120_000,
          forbid_unverified_completion: true,
        },
      },
    );

    expect(total).toBe(100);
  });

  it('credits demo2project iteration evidence as agent process maturity', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-score-process-'));
    await fs.mkdir(path.join(dir, '.demo2project', 'iterations'), { recursive: true });
    await fs.mkdir(path.join(dir, '.demo2project', 'events'), { recursive: true });
    await fs.mkdir(path.join(dir, '.demo2project', 'evidence'), { recursive: true });
    await fs.writeFile(path.join(dir, 'README.md'), '# Demo\n\n## Install\n\nx\n\n## Usage\n\n' + 'x'.repeat(420));
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      name: 'process-score',
      scripts: { test: 'node --test tests', build: 'node -c index.js', start: 'node index.js' },
    }));
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'tests', 'smoke.test.mjs'), 'import test from "node:test"; test("x", () => {});\n');
    await fs.writeFile(path.join(dir, 'index.js'), 'console.log("ok");\n');
    await fs.writeFile(path.join(dir, '.demo2project', 'iterations', 'iter_1.json'), '{"iteration_id":"iter_1"}\n');
    await fs.writeFile(path.join(dir, '.demo2project', 'events', 'iter_1.jsonl'), '{"event_type":"iteration_finished"}\n');
    await fs.writeFile(path.join(dir, '.demo2project', 'evidence', 'iter_1.json'), '{"claims":[]}\n');
    await fs.writeFile(path.join(dir, '.demo2project', 'qa-cases.json'), '[{"fingerprint":"missing_validation_after_code_change"}]\n');

    const snap = await takeSnapshot(dir);
    const score = await scoreProject(snap);

    expect(score.breakdown.agent_process_score).toBeGreaterThanOrEqual(10);
  });

  it('credits localized README setup headings and Python build metadata', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-score-python-docs-'));
    await fs.writeFile(path.join(dir, 'README.md'), '# 演示\n\n## 快速开始\n\n安装并运行。\n' + 'x'.repeat(420));
    await fs.writeFile(path.join(dir, 'app.py'), 'print("hi")\n');
    await fs.writeFile(path.join(dir, 'pyproject.toml'), '[project]\nname = "demo"\n');
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'pytest>=8.0\n');
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'tests', 'test_smoke.py'), 'def test_smoke():\n    assert True\n');

    const snap = await takeSnapshot(dir);
    const score = await scoreProject(snap);

    expect(score.breakdown.docs_score).toBeGreaterThanOrEqual(9);
    expect(score.breakdown.build_score).toBeGreaterThanOrEqual(10);
  });
});
