import path from 'node:path';
import { readTextSafe, listFiles } from '../utils/fs.js';
import { readJsonSafe } from '../utils/json.js';

/**
 * DocsTruthChecker — scan README.md (and other top-level docs) for command
 * claims and cross-reference them against actual project state.
 *
 * Truth dimensions (Phase-2 slice):
 *   - npm/pnpm/yarn run <X>     → package.json scripts has X
 *   - python -m pytest / pytest → tests/ exists OR test_*.py exists
 *   - npm test / pnpm test      → test runner discoverable
 *   - docker build / docker run → Dockerfile exists
 *   - CI claims                 → .github/workflows or .gitlab-ci.yml exists
 *   - .env / .env.example claims → .env.example exists
 */

export interface DocClaim {
  source_file: string;
  raw: string;
  kind: 'script' | 'python' | 'docker' | 'ci' | 'env';
  detail: string;
}

export interface DocClaimResult extends DocClaim {
  evidence: 'present' | 'missing';
  note?: string;
}

export interface DocsTruthReport {
  project_path: string;
  total_claims: number;
  passed: number;
  missing: number;
  results: DocClaimResult[];
}

const RUN_CMD = /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?([a-z][a-z0-9_:-]+)/gi;
const PY_TEST_CLAIM = /\b(?:pytest|python\s+-m\s+pytest|uv\s+run\s+pytest)\b/i;
const NPM_TEST = /\b(?:npm|pnpm|yarn|bun)\s+test\b/i;
const DOCKER_CLAIM = /\bdocker\s+(?:build|run|compose)\b/i;
const CI_CLAIM = /\b(?:github\s+actions|ci\.yml|gitlab[-\s]ci|circleci)\b/i;
const ENV_CLAIM = /\.env(\.example)?\b|\bENV\s+vars?\b/i;

export async function runDocsTruth(projectPath: string): Promise<DocsTruthReport> {
  const docFiles = ['README.md', 'docs/README.md', 'CONTRIBUTING.md'];
  const claims: DocClaim[] = [];
  for (const f of docFiles) {
    const txt = await readTextSafe(path.join(projectPath, f));
    if (!txt) continue;
    // Pull out fenced code blocks first; we look in both.
    const blocks = extractCodeBlocks(txt);
    const haystack = [txt, ...blocks].join('\n');
    for (const m of haystack.matchAll(RUN_CMD)) {
      claims.push({ source_file: f, raw: m[0], kind: 'script', detail: m[1] ?? '' });
    }
    if (PY_TEST_CLAIM.test(haystack)) claims.push({ source_file: f, raw: 'pytest', kind: 'python', detail: 'pytest' });
    if (NPM_TEST.test(haystack)) claims.push({ source_file: f, raw: 'npm test', kind: 'script', detail: 'test' });
    if (DOCKER_CLAIM.test(haystack)) claims.push({ source_file: f, raw: 'docker', kind: 'docker', detail: 'docker' });
    if (CI_CLAIM.test(haystack)) claims.push({ source_file: f, raw: 'CI', kind: 'ci', detail: 'ci' });
    if (ENV_CLAIM.test(haystack)) claims.push({ source_file: f, raw: '.env', kind: 'env', detail: '.env' });
  }
  const unique = dedupClaims(claims);

  // gather verifiable facts
  const pkg = await readJsonSafe<{ scripts?: Record<string, string> }>(path.join(projectPath, 'package.json'));
  const scriptNames = new Set(Object.keys(pkg?.scripts ?? {}));
  const files = await listFiles(projectPath);
  const has = (rel: string) => files.includes(rel) || files.some((f) => f.startsWith(rel + '/'));
  const hasTestsDir = files.some((f) => /(^|\/)tests?\//.test(f) || /^test_.*\.py$/.test(f) || /_test\.py$/.test(f));

  const results: DocClaimResult[] = unique.map((c) => {
    switch (c.kind) {
      case 'script': {
        // ignore script names that aren't real lifecycle words
        if (!scriptNames.has(c.detail)) {
          return { ...c, evidence: 'missing', note: `package.json has no "${c.detail}" script` };
        }
        return { ...c, evidence: 'present' };
      }
      case 'python':
        return hasTestsDir
          ? { ...c, evidence: 'present' }
          : { ...c, evidence: 'missing', note: 'no tests/ directory or test_*.py files found' };
      case 'docker':
        return has('Dockerfile')
          ? { ...c, evidence: 'present' }
          : { ...c, evidence: 'missing', note: 'README mentions docker but no Dockerfile found' };
      case 'ci':
        return has('.github/workflows') || has('.gitlab-ci.yml') || has('.circleci')
          ? { ...c, evidence: 'present' }
          : { ...c, evidence: 'missing', note: 'README mentions CI but no CI config found' };
      case 'env':
        return has('.env.example')
          ? { ...c, evidence: 'present' }
          : { ...c, evidence: 'missing', note: 'docs mention .env but no .env.example' };
    }
  });
  const passed = results.filter((r) => r.evidence === 'present').length;
  return {
    project_path: projectPath,
    total_claims: results.length,
    passed,
    missing: results.length - passed,
    results,
  };
}

function extractCodeBlocks(md: string): string[] {
  const blocks: string[] = [];
  const re = /```[a-z0-9]*\n([\s\S]*?)```/gi;
  for (const m of md.matchAll(re)) {
    if (m[1]) blocks.push(m[1]);
  }
  return blocks;
}

function dedupClaims(claims: DocClaim[]): DocClaim[] {
  const seen = new Set<string>();
  const out: DocClaim[] = [];
  for (const c of claims) {
    const key = `${c.source_file}:${c.kind}:${c.detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}
