import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { generate, writeSettings } from '../../src/integrations/claude/ClaudeSettingsGenerator.js';

describe('ClaudeSettingsGenerator', () => {
  it('generates security hooks layout', () => {
    const s = generate({ useSecurityHooks: true });
    expect(s.hooks?.PreToolUse?.[0]?.hooks.length).toBeGreaterThan(2);
  });
  it('writes and merges settings into .claude/settings.json', async () => {
    const proj = await fs.mkdtemp(path.join(os.tmpdir(), 'cgs-'));
    const file = await writeSettings(proj, generate({ useSecurityHooks: true }));
    expect(file).toContain('.claude/settings.json');
    const json = JSON.parse(await fs.readFile(file, 'utf8'));
    expect(json.hooks).toBeDefined();
  });
});
