import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fileExists } from '../../src/utils/fs.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('Docs structure', () => {
  const required = [
    'docs/getting-started/installation.md',
    'docs/getting-started/quickstart.md',
    'docs/getting-started/first-project.md',
    'docs/getting-started/claude-cli-setup.md',
    'docs/concepts/demo-to-project.md',
    'docs/concepts/verification-gate.md',
    'docs/concepts/autonomy-levels.md',
    'docs/guides/analyze-a-demo.md',
    'docs/guides/troubleshoot.md',
    'docs/reference/cli.md',
    'docs/reference/config.md',
    'docs/reference/sdk.md',
    'docs/advanced/extension-development.md',
  ];
  for (const r of required) {
    it(`${r} exists`, () => {
      expect(fileExists(path.join(root, r))).toBe(true);
    });
  }
});
