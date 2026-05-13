import path from 'node:path';
import { writeJson, readJsonSafe } from '../../utils/json.js';
import { ensureDir, fileExists } from '../../utils/fs.js';

export interface ClaudeSettingsHooks {
  hooks?: {
    PreToolUse?: { matcher?: string; hooks: { type: 'command'; command: string }[] }[];
    PostToolUse?: { matcher?: string; hooks: { type: 'command'; command: string }[] }[];
    Stop?: { hooks: { type: 'command'; command: string }[] }[];
  };
  permissions?: { allow?: string[]; deny?: string[] };
}

export function generate(opts: { useSecurityHooks?: boolean } = {}): ClaudeSettingsHooks {
  const securityDir = '.claude/hooks/demo2project-security';
  const baselineDir = '.claude/hooks/demo2project';
  const pre = opts.useSecurityHooks
    ? [
        { type: 'command' as const, command: `node ${securityDir}/pre-tool-use-security-policy.mjs` },
        { type: 'command' as const, command: `node ${securityDir}/pre-tool-use-command-guard.mjs` },
        { type: 'command' as const, command: `node ${securityDir}/pre-tool-use-file-access-guard.mjs` },
        { type: 'command' as const, command: `node ${securityDir}/pre-tool-use-secret-protection.mjs` },
      ]
    : [{ type: 'command' as const, command: `node ${baselineDir}/pre-tool-use-safety.mjs` }];
  const post = opts.useSecurityHooks
    ? [
        { type: 'command' as const, command: `node ${securityDir}/post-tool-use-audit-recorder.mjs` },
        { type: 'command' as const, command: `node ${securityDir}/post-tool-use-evidence-recorder.mjs` },
      ]
    : [{ type: 'command' as const, command: `node ${baselineDir}/post-tool-use-event-recorder.mjs` }];
  const stop = opts.useSecurityHooks
    ? [
        { type: 'command' as const, command: `node ${securityDir}/stop-verification-and-policy-gate.mjs` },
        { type: 'command' as const, command: `node ${securityDir}/stop-incident-check.mjs` },
      ]
    : [{ type: 'command' as const, command: `node ${baselineDir}/stop-verification-gate.mjs` }];
  return {
    hooks: {
      PreToolUse: [{ hooks: pre }],
      PostToolUse: [{ hooks: post }],
      Stop: [{ hooks: stop }],
    },
    permissions: {
      deny: ['Bash(rm -rf /:*)', 'Bash(sudo:*)'],
    },
  };
}

export async function writeSettings(projectPath: string, settings: ClaudeSettingsHooks): Promise<string> {
  const dir = path.join(projectPath, '.claude');
  await ensureDir(dir);
  const file = path.join(dir, 'settings.json');
  const existing = (await readJsonSafe<Record<string, unknown>>(file)) ?? {};
  const merged = { ...existing, ...settings };
  await writeJson(file, merged);
  return file;
}

void fileExists;
