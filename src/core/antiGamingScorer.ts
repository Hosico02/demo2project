import path from 'node:path';
import type { ProjectSnapshot } from './types.js';
import { readTextSafe, listFiles } from '../utils/fs.js';
import { readJsonSafe } from '../utils/json.js';

/**
 * Anti-gaming detectors (Phase 4).
 *
 * Each detector looks at the filesystem state and returns a finding when
 * the project shows a known gaming pattern (empty test files, echo-only
 * build scripts, fake CI, secrets in source, etc.).
 *
 * The detectors are independent of the scorer — they emit findings; the
 * evidence-weighted scorer (or any caller) decides how to apply penalty.
 */

export interface AntiGamingFinding {
  detector: string;
  severity: 'blocker' | 'high' | 'medium' | 'low';
  message: string;
  related_files: string[];
  suggested_penalty: number; // points to subtract from the dimension
  dimension: 'test_score' | 'build_score' | 'docs_score' | 'agent_process_score' | 'safety_score' | 'maintainability_score' | 'config_score';
}

const EMPTY_TEST_PATTERNS = [
  /^\s*$/, // pure whitespace test file
];
const SHAM_TEST_PATTERNS = [
  /\bexpect\(\s*true\s*\)\s*\.\s*toBe\(\s*true\s*\)/,
  /\bexpect\(\s*1\s*\)\s*\.\s*toBe\(\s*1\s*\)/,
  /\bassert\.\s*ok\(\s*true\s*\)/,
  /\bassert\.\s*equal\(\s*1\s*,\s*1\s*\)/,
];
const ECHO_BUILD_PATTERNS = [
  /^echo\b/,
  /^node\s+-e\s+["']console\.log/,
  /^true$/,
  /^:$/,
];
const SECRET_PATTERNS = [
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bsk-ant-[A-Za-z0-9_\-]{20,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

export async function runAntiGaming(snapshot: ProjectSnapshot): Promise<AntiGamingFinding[]> {
  const root = snapshot.project_path;
  const files = await listFiles(root);
  const findings: AntiGamingFinding[] = [];

  // 1. Empty / sham test files
  const testFiles = files.filter((f) => /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs|py)$/.test(f) || /(^|\/)tests?\//.test(f));
  for (const f of testFiles.slice(0, 30)) {
    const txt = (await readTextSafe(path.join(root, f))) ?? '';
    if (txt.trim().length === 0 || EMPTY_TEST_PATTERNS.some((p) => p.test(txt))) {
      findings.push({
        detector: 'empty_test_file',
        severity: 'high',
        message: `${f} is empty / whitespace only`,
        related_files: [f],
        suggested_penalty: 6,
        dimension: 'test_score',
      });
      continue;
    }
    if (SHAM_TEST_PATTERNS.some((p) => p.test(txt))) {
      findings.push({
        detector: 'sham_test_assertion',
        severity: 'high',
        message: `${f} contains tautological assertion (assert true / 1==1)`,
        related_files: [f],
        suggested_penalty: 6,
        dimension: 'test_score',
      });
    }
    if (/^\s*it\.skip|^\s*test\.skip|^\s*xit\b|^\s*xtest\b/m.test(txt)) {
      findings.push({
        detector: 'all_tests_skipped',
        severity: 'medium',
        message: `${f} skips tests via it.skip/xit/test.skip`,
        related_files: [f],
        suggested_penalty: 3,
        dimension: 'test_score',
      });
    }
  }

  // 2. Echo-only / no-op build scripts
  const pkg = await readJsonSafe<{ scripts?: Record<string, string> }>(path.join(root, 'package.json'));
  const scripts = pkg?.scripts ?? {};
  for (const key of ['build', 'typecheck', 'lint']) {
    const s = (scripts[key] ?? '').trim();
    if (!s) continue;
    if (ECHO_BUILD_PATTERNS.some((p) => p.test(s))) {
      findings.push({
        detector: 'no_op_script',
        severity: 'high',
        message: `package.json scripts.${key} is a no-op: "${s}"`,
        related_files: ['package.json'],
        suggested_penalty: 5,
        dimension: 'build_score',
      });
    }
  }

  // 3. Fake CI (no actual test/build invocation)
  const ciCandidates = ['.github/workflows/ci.yml', '.github/workflows/ci.yaml', '.gitlab-ci.yml'];
  for (const ci of ciCandidates) {
    const body = (await readTextSafe(path.join(root, ci))) ?? '';
    if (!body) continue;
    const hasReal = /\b(npm|pnpm|yarn|bun)\s+(test|run\s+(test|build|typecheck))\b/i.test(body)
      || /\bpytest\b/i.test(body)
      || /\btsc\b/i.test(body)
      || /\bnode\s+--test\b/i.test(body);
    if (!hasReal) {
      findings.push({
        detector: 'fake_ci',
        severity: 'medium',
        message: `${ci} exists but does not invoke a real test/build runner`,
        related_files: [ci],
        suggested_penalty: 4,
        dimension: 'agent_process_score',
      });
    }
  }

  // 4. Test runner cannot discover tests (heuristic: test script names a dir that has no test files)
  const testScript = (scripts.test ?? '').trim();
  if (testScript) {
    const target = discoverExplicitTestTarget(testScript);
    if (target) {
      const exists = await explicitTestTargetExists(root, files, target);
      if (!exists) {
        findings.push({
          detector: 'test_target_missing',
          severity: 'high',
          message: `scripts.test references "${target}" which does not exist`,
          related_files: ['package.json'],
          suggested_penalty: 6,
          dimension: 'test_score',
        });
      }
    }
  }

  // 5. Secrets hardcoded in source
  const sourceLike = files.filter((f) =>
    /\.(ts|tsx|js|jsx|mjs|cjs|py|env|json|yml|yaml)$/.test(f) && !f.endsWith('.env.example'),
  ).slice(0, 60);
  for (const f of sourceLike) {
    const body = (await readTextSafe(path.join(root, f))) ?? '';
    for (const p of SECRET_PATTERNS) {
      if (p.test(body)) {
        findings.push({
          detector: 'forbidden_pattern_in_source',
          severity: 'blocker',
          message: `secret-shaped pattern (${p.source}) found in ${f}`,
          related_files: [f],
          suggested_penalty: 8,
          dimension: 'safety_score',
        });
        break;
      }
    }
  }

  // 6. Dependency bloat — many declared deps, few imports
  if (pkg && (((pkg as { dependencies?: Record<string, string> }).dependencies) || ((pkg as { devDependencies?: Record<string, string> }).devDependencies))) {
    const decl = Object.keys({
      ...((pkg as { dependencies?: Record<string, string> }).dependencies ?? {}),
      ...((pkg as { devDependencies?: Record<string, string> }).devDependencies ?? {}),
    });
    if (decl.length > 0) {
      let imported = 0;
      const srcFiles = files.filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f)).slice(0, 40);
      for (const f of srcFiles) {
        const body = (await readTextSafe(path.join(root, f))) ?? '';
        for (const d of decl) {
          if (new RegExp(`\\b(require\\(|import [\\w*{}\\s,]+from\\s+)['"]${d.replace(/[/\-.]/g, '\\$&')}['"]`).test(body)) {
            imported++;
            break;
          }
        }
      }
      if (decl.length >= 10 && imported < decl.length * 0.3) {
        findings.push({
          detector: 'dependency_bloat',
          severity: 'medium',
          message: `${decl.length} dependencies declared but only ~${imported} look imported`,
          related_files: ['package.json'],
          suggested_penalty: 3,
          dimension: 'maintainability_score',
        });
      }
    }
  }

  return findings;
}

function discoverExplicitTestTarget(script: string): string | null {
  const match = script.match(/\b(node\s+--test|vitest|jest|pytest)\b([\s\S]*)/);
  if (!match) return null;
  const runner = match[1]!;
  const rest = match[2] ?? '';
  const tokens = rest.split(/\s+/).map((t) => t.trim()).filter(Boolean);
  let skipNext = false;
  for (const token of tokens) {
    const normalized = normalizeScriptToken(token);
    if (/^[|;&]/.test(normalized)) break;
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (runner === 'vitest' && normalized === 'run') continue;
    if (/^--[^=]+=.*/.test(normalized)) continue;
    if (/^--/.test(normalized)) {
      if (/^(--config|--project|--root|--dir|--testMatch|--testRegex|--test-reporter)$/.test(normalized)) {
        skipNext = true;
      }
      continue;
    }
    if (/^-[A-Za-z]/.test(normalized)) {
      if (/^(--config|--project|--root|--dir|--testMatch|--testRegex|--runInBand)$/.test(normalized)) {
        skipNext = true;
      }
      continue;
    }
    return normalized;
  }
  return null;
}

async function explicitTestTargetExists(root: string, files: string[], target: string): Promise<boolean> {
  const normalized = target.replace(/\\/g, '/').replace(/^\.\/+/, '');
  if (normalized.includes('*')) {
    const fixedPrefix = normalized.split(/[*[{?]/)[0]?.replace(/\/?$/, '/') ?? '';
    const testLike = /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs|py)$|(^|\/)tests?\//;
    return files.some((f) => f.startsWith(fixedPrefix) && testLike.test(f));
  }
  const looksLikeFile = await readTextSafe(path.join(root, normalized));
  const hasUnderDir = files.some((f) => f.startsWith(normalized.replace(/\/$/, '') + '/'));
  return looksLikeFile !== null || hasUnderDir;
}

function normalizeScriptToken(token: string): string {
  return token.replace(/^['"]|['"]$/g, '');
}
