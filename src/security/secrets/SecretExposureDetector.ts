import path from 'node:path';
import { readTextSafe } from '../../utils/fs.js';
import { stateDir } from '../../utils/paths.js';
import { scanText } from './SecretScanner.js';
import type { SecretFinding } from './SecretScanner.js';

export interface ExposureSurface {
  path: string;
  description: string;
  findings: SecretFinding[];
}

export interface ExposureReport {
  project_path: string;
  total_findings: number;
  high_risk: number;
  surfaces: ExposureSurface[];
}

const SURFACES = [
  { rel: 'qa-cases.json', desc: 'QA case store' },
  { rel: 'evidence', desc: 'evidence graph dir' },
  { rel: 'events', desc: 'event JSONL dir' },
  { rel: 'iterations', desc: 'iteration summaries' },
  { rel: 'sessions', desc: 'session manifests' },
  { rel: 'audit/audit.log', desc: 'audit log' },
  { rel: 'replay', desc: 'replay bundles dir' },
];

export async function detectExposure(projectPath: string): Promise<ExposureReport> {
  const root = stateDir(projectPath);
  const surfaces: ExposureSurface[] = [];
  for (const s of SURFACES) {
    const p = path.join(root, s.rel);
    const txt = await readTextSafe(p);
    if (!txt) continue;
    const r = await scanText(txt, s.rel);
    if (r.findings.length > 0) surfaces.push({ path: s.rel, description: s.desc, findings: r.findings });
  }
  const total = surfaces.reduce((a, b) => a + b.findings.length, 0);
  const high = surfaces.reduce((a, b) => a + b.findings.filter((f) => f.exposure_risk === 'high').length, 0);
  return { project_path: projectPath, total_findings: total, high_risk: high, surfaces };
}
