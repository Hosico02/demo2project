import path from 'node:path';
import { ensureDir, writeText, readTextSafe, fileExists } from '../../utils/fs.js';
import { writeJson } from '../../utils/json.js';
import { stateDir } from '../../utils/paths.js';
import { analyzeProject as analyzeDeps } from './DependencyRiskAnalyzer.js';
import type { DependencyAnalysis } from './DependencyRiskAnalyzer.js';
import { analyze as analyzeScripts } from './PackageScriptAnalyzer.js';
import type { PackageScriptReport } from './PackageScriptAnalyzer.js';
import { analyzeLockfileChange } from './LockfileChangeAnalyzer.js';
import type { LockfileChangeReport } from './LockfileChangeAnalyzer.js';

export interface SupplyChainReportData {
  project_path: string;
  generated_at: string;
  dependencies: DependencyAnalysis;
  scripts: PackageScriptReport;
  lockfile_change?: LockfileChangeReport;
  recommendations: string[];
}

export async function scan(projectPath: string): Promise<SupplyChainReportData> {
  const deps = await analyzeDeps(projectPath);
  const scripts = await analyzeScripts(projectPath);
  const recs: string[] = [];
  if (deps.suspect > 0) recs.push(`Review ${deps.suspect} suspect dependency(ies)`);
  if (scripts.lifecycle_scripts.length > 0) recs.push('Disable lifecycle scripts in untrusted mode');
  if (scripts.findings.some((f) => f.severity === 'critical')) recs.push('Block critical package scripts');
  return {
    project_path: projectPath,
    generated_at: new Date().toISOString(),
    dependencies: deps,
    scripts,
    recommendations: recs,
  };
}

export async function diff(beforeSnapshot: string, afterSnapshot: string): Promise<LockfileChangeReport | { error: string }> {
  const a = await readTextSafe(beforeSnapshot);
  const b = await readTextSafe(afterSnapshot);
  if (a === null || b === null) return { error: 'missing snapshot text' };
  return analyzeLockfileChange(a, b);
}

export async function writeReport(projectPath: string, data: SupplyChainReportData): Promise<{ json: string; md: string }> {
  const dir = path.join(stateDir(projectPath), 'security', 'supply-chain');
  await ensureDir(dir);
  const jsonPath = path.join(dir, 'report.json');
  const mdPath = path.join(dir, 'report.md');
  await writeJson(jsonPath, data);
  const lines = [
    '# Supply Chain Report',
    `Generated: ${data.generated_at}`,
    '',
    `## Dependencies (total ${data.dependencies.total})`,
    `- ok: ${data.dependencies.ok}`,
    `- review: ${data.dependencies.review}`,
    `- suspect: ${data.dependencies.suspect}`,
    '',
    '## Scripts',
    `- Lifecycle: ${data.scripts.lifecycle_scripts.join(', ') || '—'}`,
    `- Findings: ${data.scripts.findings.length}`,
    '',
    '## Recommendations',
    ...(data.recommendations.length > 0 ? data.recommendations.map((r) => `- ${r}`) : ['- (none)']),
  ];
  await writeText(mdPath, lines.join('\n') + '\n');
  return { json: jsonPath, md: mdPath };
}

void fileExists;
