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

  it('does not award substantive documentation credit for placeholder README content', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-score-placeholder-readme-'));
    await fs.writeFile(path.join(dir, 'README.md'), '# Demo\n\nTODO\n');
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      name: 'placeholder-readme',
      scripts: { test: 'node --test tests/smoke.test.mjs' },
    }));
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'tests', 'smoke.test.mjs'), 'import test from "node:test"; test("x", () => {});\n');

    const snap = await takeSnapshot(dir);
    const score = await scoreProject(snap);

    expect(score.breakdown.docs_score).toBeLessThanOrEqual(2);
    expect(score.notes.join('\n')).toContain('README appears placeholder or too thin');
  });

  it('does not award major test/build/config/CI credit for placeholder scaffolding', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-score-placeholder-scaffold-'));
    await fs.writeFile(path.join(dir, 'README.md'), '# Demo\n\nTODO\n');
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      name: 'placeholder-scaffold',
      scripts: {
        test: 'echo ok',
        build: 'echo build ok',
        start: 'node index.js',
      },
    }));
    await fs.writeFile(path.join(dir, 'index.js'), 'console.log("demo");\n');
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'tests', 'smoke.test.mjs'), '// placeholder test file\n');
    await fs.writeFile(path.join(dir, '.env.example'), '# TODO\n');
    await fs.mkdir(path.join(dir, '.github', 'workflows'), { recursive: true });
    await fs.writeFile(path.join(dir, '.github', 'workflows', 'ci.yml'), 'name: CI\njobs: {}\n');

    const snap = await takeSnapshot(dir);
    const score = await scoreProject(snap);

    expect(score.breakdown.test_score).toBeLessThanOrEqual(4);
    expect(score.breakdown.build_score).toBe(0);
    expect(score.breakdown.config_score).toBe(0);
    expect(score.breakdown.agent_process_score).toBe(0);
    expect(score.notes.join('\n')).toContain('test command appears placeholder');
    expect(score.notes.join('\n')).toContain('build command appears placeholder');
    expect(score.notes.join('\n')).toContain('.env.example appears placeholder');
    expect(score.notes.join('\n')).toContain('CI workflow appears empty or non-verifying');
  });

  it('does not treat redaction regex literals as leaked private keys', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-score-redaction-regex-'));
    await fs.writeFile(path.join(dir, 'README.md'), '# Demo\n\n## Usage\n\nRun the Flask demo.\n' + 'x'.repeat(260));
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      name: 'redaction-regex',
      scripts: {
        test: 'python3 -m pytest -q',
        build: 'python3 -m py_compile app.py',
      },
    }));
    await fs.writeFile(path.join(dir, 'app.py'), [
      'import re',
      '',
      'def redact(text):',
      '    text = re.sub(r"sk-[a-zA-Z0-9]{20,}", "[API_KEY_REDACTED]", text)',
      '    return re.sub(r"-----BEGIN PRIVATE KEY-----.*?-----END PRIVATE KEY-----", "[PRIVATE_KEY_REDACTED]", text)',
      '',
    ].join('\n'));
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'tests', 'test_app.py'), [
      'from app import redact',
      '',
      'def test_redacts_dummy_key_fixture():',
      '    assert redact("sk-1234567890abcdefghij") == "[API_KEY_REDACTED]"',
      '',
    ].join('\n'));

    const snap = await takeSnapshot(dir);
    const score = await scoreProject(snap);

    expect(score.breakdown.safety_score).toBe(8);
    expect(score.notes.join('\n')).not.toContain('forbidden pattern matched');
  });

  it('credits CI process only when workflows run real verification commands', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-score-real-ci-'));
    await fs.writeFile(path.join(dir, 'README.md'), '# Demo\n\n## Install\n\nnpm install\n\n## Usage\n\nRun the checked Node demo locally.\n' + 'x'.repeat(260));
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      name: 'real-ci',
      scripts: {
        test: 'node --test tests/smoke.test.mjs',
        build: 'node -c index.js',
      },
    }));
    await fs.writeFile(path.join(dir, 'index.js'), 'console.log("demo");\n');
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, 'tests', 'smoke.test.mjs'), 'import test from "node:test"; import assert from "node:assert/strict"; test("x", () => assert.equal(1, 1));\n');
    await fs.mkdir(path.join(dir, '.github', 'workflows'), { recursive: true });
    await fs.writeFile(path.join(dir, '.github', 'workflows', 'ci.yml'), [
      'name: CI',
      'jobs:',
      '  test:',
      '    steps:',
      '      - run: npm test',
      '      - run: npm run build',
      '',
    ].join('\n'));

    const snap = await takeSnapshot(dir);
    const score = await scoreProject(snap);

    expect(score.breakdown.agent_process_score).toBe(7);
    expect(score.notes.join('\n')).not.toContain('CI workflow appears empty or non-verifying');
  });

  it('credits mjs product cores as maintainable source and package bin as runtime', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-score-product-core-cli-'));
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.mkdir(path.join(dir, 'bin'), { recursive: true });
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.mkdir(path.join(dir, 'docs'), { recursive: true });
    await fs.mkdir(path.join(dir, '.github', 'workflows'), { recursive: true });
    await fs.writeFile(path.join(dir, 'README.md'), '# Product CLI\n\n## Install\n\nnpm install\n\n## Usage\n\nRun the product CLI with `product --help` or `npm test`.\n\n## Verification\n\nUse `npm test` and `npm run build`.\n' + 'x'.repeat(320));
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      name: 'product-cli',
      type: 'module',
      bin: { product: './bin/product.js' },
      scripts: {
        test: 'node --test',
        build: 'node --check src/product-core.mjs',
        'product:core-check': 'node --test tests/product-core.test.mjs',
      },
    }, null, 2));
    await fs.writeFile(path.join(dir, 'bin', 'product.js'), '#!/usr/bin/env node\nimport { runWorkflow } from "../src/product-core.mjs";\nconsole.log(JSON.stringify(runWorkflow("status")));\n');
    await fs.writeFile(path.join(dir, 'src', 'product-core.mjs'), 'export function runWorkflow(name = "status") { return { ok: true, name }; }\n');
    await fs.writeFile(path.join(dir, 'tests', 'product-core.test.mjs'), 'import test from "node:test"; import assert from "node:assert/strict"; import { runWorkflow } from "../src/product-core.mjs"; test("product core workflow", () => assert.equal(runWorkflow("status").ok, true));\n');
    await fs.writeFile(path.join(dir, 'docs', 'product-core.md'), '# Product Core\n');
    await fs.writeFile(path.join(dir, '.env.example'), 'NODE_ENV=development\nLOG_LEVEL=info\n');
    await fs.writeFile(path.join(dir, '.gitignore'), 'node_modules\n.env\n');
    await fs.writeFile(path.join(dir, '.github', 'workflows', 'ci.yml'), 'name: CI\njobs:\n  test:\n    steps:\n      - run: npm test\n      - run: npm run build\n');

    const snap = await takeSnapshot(dir);
    const score = await scoreProject(snap);

    expect(score.breakdown.runtime_score).toBeGreaterThanOrEqual(8);
    expect(score.breakdown.test_score).toBeGreaterThanOrEqual(15);
    expect(score.breakdown.maintainability_score).toBe(10);
    expect(score.total).toBeGreaterThanOrEqual(86);
    expect(score.grade).toBe('production_ready_baseline');
  });
});
