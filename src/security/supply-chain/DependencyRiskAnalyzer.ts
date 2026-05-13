import path from 'node:path';
import { readJsonSafe } from '../../utils/json.js';
import { fileExists } from '../../utils/fs.js';

export type DepRisk = 'ok' | 'review' | 'suspect';

export interface DepFinding {
  name: string;
  version: string;
  risk: DepRisk;
  reasons: string[];
}

const KNOWN_POPULAR: Set<string> = new Set([
  'react', 'vue', 'svelte', 'next', 'angular', 'express', 'koa', 'fastify', 'lodash', 'underscore',
  'axios', 'node-fetch', 'typescript', 'webpack', 'vite', 'rollup', 'esbuild', 'eslint', 'prettier',
  'jest', 'vitest', 'mocha', 'chai', 'sinon', 'zod', 'yup', 'commander', 'yargs', 'chalk', 'fs-extra',
  'dotenv', 'cors', 'helmet', 'jsonwebtoken', 'bcrypt', 'mongoose', 'sequelize', 'prisma', 'redis', 'pg',
]);

function looksLikeTyposquat(name: string): { suspect: boolean; reason?: string } {
  const lower = name.toLowerCase();
  for (const popular of KNOWN_POPULAR) {
    if (lower === popular) return { suspect: false };
    // edit distance heuristic: same length ±1, differing by 1-2 chars
    if (Math.abs(lower.length - popular.length) <= 1) {
      let diff = 0;
      const len = Math.max(lower.length, popular.length);
      for (let i = 0, j = 0; i < lower.length || j < popular.length;) {
        const a = lower[i], b = popular[j];
        if (a === b) { i++; j++; continue; }
        diff++;
        if (diff > 2) break;
        if (lower.length > popular.length) i++;
        else if (lower.length < popular.length) j++;
        else { i++; j++; }
      }
      if (diff > 0 && diff <= 2 && len >= 5) {
        return { suspect: true, reason: `near-match to '${popular}'` };
      }
    }
  }
  return { suspect: false };
}

function isLooseVersion(v: string): boolean {
  // accept exact pins, ^x.y.z, ~x.y.z; flag '*', 'latest', empty
  if (!v) return true;
  if (v === '*' || v === 'latest') return true;
  return false;
}

function isUrlOrGit(v: string): boolean {
  return /^(git\+|git:|file:|http:|https:|github:)/.test(v);
}

export interface DependencyAnalysis {
  total: number;
  ok: number;
  review: number;
  suspect: number;
  findings: DepFinding[];
}

export async function analyzeProject(projectPath: string): Promise<DependencyAnalysis> {
  const pkgPath = path.join(projectPath, 'package.json');
  if (!fileExists(pkgPath)) return { total: 0, ok: 0, review: 0, suspect: 0, findings: [] };
  const pkg = await readJsonSafe<{ dependencies?: Record<string, string>; devDependencies?: Record<string, string> }>(pkgPath);
  const all: Record<string, string> = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  const findings: DepFinding[] = [];
  for (const [name, ver] of Object.entries(all)) {
    const reasons: string[] = [];
    let risk: DepRisk = 'ok';
    const typo = looksLikeTyposquat(name);
    if (typo.suspect) {
      reasons.push(typo.reason!);
      risk = 'suspect';
    }
    if (isLooseVersion(ver)) {
      reasons.push(`loose version '${ver}'`);
      risk = risk === 'suspect' ? 'suspect' : 'review';
    }
    if (isUrlOrGit(ver)) {
      reasons.push(`source is git/url/tarball: ${ver}`);
      risk = 'suspect';
    }
    findings.push({ name, version: ver, risk, reasons });
  }
  return {
    total: findings.length,
    ok: findings.filter((f) => f.risk === 'ok').length,
    review: findings.filter((f) => f.risk === 'review').length,
    suspect: findings.filter((f) => f.risk === 'suspect').length,
    findings,
  };
}
