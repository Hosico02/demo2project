import path from 'node:path';
import { fileExists, readTextSafe } from '../../utils/fs.js';

const REQUIRED_DOCS = [
  'docs/getting-started/installation.md',
  'docs/getting-started/quickstart.md',
  'docs/getting-started/first-project.md',
  'docs/getting-started/claude-cli-setup.md',
  'docs/concepts/demo-to-project.md',
  'docs/concepts/project-score.md',
  'docs/concepts/gap-analysis.md',
  'docs/concepts/verification-gate.md',
  'docs/concepts/qa-learning.md',
  'docs/concepts/evidence-graph.md',
  'docs/concepts/autonomy-levels.md',
  'docs/guides/analyze-a-demo.md',
  'docs/guides/run-qa-preflight.md',
  'docs/guides/install-claude-hooks.md',
  'docs/guides/setup-github-actions.md',
  'docs/guides/troubleshoot.md',
  'docs/security/overview.md',
  'docs/reference/cli.md',
  'docs/reference/config.md',
  'docs/reference/sdk.md',
  'docs/advanced/extension-development.md',
];

export interface DocsCheckReport {
  total_required: number;
  present: number;
  missing: string[];
  warnings: string[];
  readme_has_quickstart: boolean;
  ok: boolean;
}

export async function check(systemRoot: string): Promise<DocsCheckReport> {
  const missing: string[] = [];
  for (const d of REQUIRED_DOCS) {
    if (!fileExists(path.join(systemRoot, d))) missing.push(d);
  }
  const readme = await readTextSafe(path.join(systemRoot, 'README.md'));
  const hasQuickstart = !!readme && /quickstart/i.test(readme);
  const warnings: string[] = [];
  if (!hasQuickstart) warnings.push('README missing Quickstart section');
  return {
    total_required: REQUIRED_DOCS.length,
    present: REQUIRED_DOCS.length - missing.length,
    missing,
    warnings,
    readme_has_quickstart: hasQuickstart,
    ok: missing.length === 0 && hasQuickstart,
  };
}
