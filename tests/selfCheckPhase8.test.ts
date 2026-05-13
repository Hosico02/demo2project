import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fileExists } from '../src/utils/fs.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('Phase 8 self-check probes', () => {
  const required = [
    'src/cli/commands/doctor.ts',
    'src/cli/commands/next.ts',
    'src/cli/commands/quickstart.ts',
    'src/cli/commands/setupCli.ts',
    'src/cli/commands/configCli.ts',
    'src/cli/commands/diagnostics.ts',
    'src/cli/commands/reportsCli.ts',
    'src/cli/commands/claudeProductCli.ts',
    'src/cli/commands/githubCli.ts',
    'src/cli/commands/extensionsCli.ts',
    'src/cli/commands/recipesCli.ts',
    'src/cli/commands/compatibilityCli.ts',
    'src/cli/commands/releaseCli.ts',
    'src/cli/commands/examplesCli.ts',
    'src/product/config/ConfigManager.ts',
    'src/product/setup/SetupWizard.ts',
    'src/product/onboarding/OnboardingGuide.ts',
    'src/product/onboarding/Quickstart.ts',
    'src/product/reports/ReportSystem.ts',
    'src/product/reports/MarkdownRenderer.ts',
    'src/product/reports/JsonRenderer.ts',
    'src/product/reports/HtmlRenderer.ts',
    'src/product/diagnostics/DiagnosticSystem.ts',
    'src/product/diagnostics/ErrorCatalog.ts',
    'src/product/diagnostics/RemediationAdvisor.ts',
    'src/product/diagnostics/TroubleshootingGuide.ts',
    'src/product/compatibility/CompatibilityManager.ts',
    'src/product/release/ReleaseCheck.ts',
    'src/product/release/MigrationManager.ts',
    'src/product/release/ProductReadinessScorer.ts',
    'src/product/ux/UXQualityChecker.ts',
    'src/product/docs/DocsChecker.ts',
    'src/product/examples/ExamplesManager.ts',
    'src/integrations/claude/ClaudeIntegrationManager.ts',
    'src/integrations/github/WorkflowInstaller.ts',
    'src/extensions/ExtensionManager.ts',
    'src/sdk/index.ts',
    'recipes/node-cli-projectization.json',
    'CHANGELOG.md',
    'LICENSE',
  ];
  for (const r of required) {
    it(`${r} exists`, () => {
      expect(fileExists(path.join(root, r))).toBe(true);
    });
  }
});
