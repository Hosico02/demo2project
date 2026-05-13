import path from 'node:path';
import { fileExists } from '../../utils/fs.js';
import { check as releaseCheck } from './ReleaseCheck.js';
import { check as compatCheck } from '../compatibility/CompatibilityManager.js';

export interface ProductScoreDimension {
  name: string;
  weight: number;
  score: number;
  out_of: number;
  notes: string[];
}

export interface ProductReadinessReport {
  generated_at: string;
  total_score: number;
  out_of: number;
  dimensions: ProductScoreDimension[];
  grade: 'demo' | 'usable' | 'shipping' | 'mature';
  recommendations: string[];
}

function bool(b: boolean, max = 1): number { return b ? max : 0; }

export async function score(systemRoot: string): Promise<ProductReadinessReport> {
  const dims: ProductScoreDimension[] = [];
  // 1. installability
  const rel = await releaseCheck(systemRoot);
  const installOK = rel.checks.filter((c) => ['package.json present', 'package.name', 'package.version', 'package.bin'].includes(c.name)).every((c) => c.ok);
  dims.push({ name: 'installability', weight: 1, score: bool(installOK, 12), out_of: 12, notes: installOK ? ['package.json + bin + version'] : ['fix package metadata'] });
  // 2. cli_ux
  const cliFiles = ['src/cli/index.ts', 'src/cli/commands/selfCheck.ts'];
  const cliOk = cliFiles.every((f) => fileExists(path.join(systemRoot, f)));
  const cliUx = bool(cliOk, 10) + bool(fileExists(path.join(systemRoot, 'src', 'cli', 'commands', 'doctor.ts')), 4);
  dims.push({ name: 'cli_ux', weight: 1, score: cliUx, out_of: 14, notes: [`base cli ${cliOk}`, `doctor ${fileExists(path.join(systemRoot, 'src', 'cli', 'commands', 'doctor.ts'))}`] });
  // 3. documentation
  const docCount = ['README.md', 'docs/security-overview.md', 'docs/getting-started/quickstart.md', 'docs/concepts/demo-to-project.md', 'docs/reference/cli.md', 'docs/guides/troubleshoot.md'].filter((f) => fileExists(path.join(systemRoot, f))).length;
  dims.push({ name: 'documentation', weight: 1, score: docCount * 2, out_of: 12, notes: [`${docCount}/6 key docs present`] });
  // 4. integration
  const int = bool(fileExists(path.join(systemRoot, 'templates', 'claude', 'hooks', 'pre-tool-use-safety.mjs')), 4) + bool(fileExists(path.join(systemRoot, 'templates', 'github', 'workflows', 'demo2project-preflight.yml')), 4) + bool(fileExists(path.join(systemRoot, 'src', 'sdk', 'index.ts')), 4);
  dims.push({ name: 'integration', weight: 1, score: int, out_of: 12, notes: ['claude hooks', 'github workflows', 'sdk'] });
  // 5. safety defaults
  const safe = bool(fileExists(path.join(systemRoot, 'src', 'security', 'policy', 'default-security-policy.json')), 4) + bool(fileExists(path.join(systemRoot, 'src', 'security', 'untrusted', 'RepositoryTrustEvaluator.ts')), 4) + bool(fileExists(path.join(systemRoot, 'src', 'privacy', 'PrivacyMode.ts')), 4);
  dims.push({ name: 'safety_defaults', weight: 1, score: safe, out_of: 12, notes: ['default policy', 'untrusted mode', 'privacy mode'] });
  // 6. report quality
  const rep = bool(fileExists(path.join(systemRoot, 'src', 'product', 'reports', 'MarkdownRenderer.ts')), 3) + bool(fileExists(path.join(systemRoot, 'src', 'product', 'reports', 'JsonRenderer.ts')), 3) + bool(fileExists(path.join(systemRoot, 'src', 'product', 'reports', 'HtmlRenderer.ts')), 3);
  dims.push({ name: 'report_quality', weight: 1, score: rep, out_of: 9, notes: ['MD', 'JSON', 'HTML'] });
  // 7. migration
  const mig = bool(fileExists(path.join(systemRoot, 'src', 'product', 'config', 'ConfigMigration.ts')), 4) + bool(fileExists(path.join(systemRoot, 'src', 'product', 'release', 'MigrationManager.ts')), 4);
  dims.push({ name: 'migration', weight: 1, score: mig, out_of: 8, notes: ['config migration', 'migration manager'] });
  // 8. supportability
  const sup = bool(fileExists(path.join(systemRoot, 'src', 'product', 'diagnostics', 'DiagnosticSystem.ts')), 4) + bool(fileExists(path.join(systemRoot, 'src', 'product', 'diagnostics', 'ErrorCatalog.ts')), 4) + bool(fileExists(path.join(systemRoot, 'src', 'product', 'diagnostics', 'TroubleshootingGuide.ts')), 3);
  dims.push({ name: 'supportability', weight: 1, score: sup, out_of: 11, notes: ['doctor', 'error catalog', 'logs:explain'] });
  // compat warnings
  const cr = await compatCheck(systemRoot);
  const recs: string[] = [];
  if (cr.warnings.length > 0) recs.push(...cr.warnings.map((w) => `compat: ${w}`));
  if (!installOK) recs.push('Fix package metadata before publishing');
  const total = dims.reduce((a, d) => a + d.score, 0);
  const max = dims.reduce((a, d) => a + d.out_of, 0);
  const pct = total / max;
  const grade: ProductReadinessReport['grade'] = pct >= 0.9 ? 'mature' : pct >= 0.75 ? 'shipping' : pct >= 0.5 ? 'usable' : 'demo';
  return { generated_at: new Date().toISOString(), total_score: total, out_of: max, dimensions: dims, grade, recommendations: recs };
}
