#!/usr/bin/env node
/**
 * Demo2Project — PreToolUse safety hook.
 *
 * Reads a JSON event on stdin (Claude Code hook protocol) and decides whether
 * to allow or block the upcoming tool invocation. Exits with code 2 + a
 * stderr message to block — Claude Code treats that as a hard veto.
 *
 * Disable: set env var DEMO2PROJECT_HOOKS_DISABLED=1.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

function block(reason) {
  process.stderr.write(`[demo2project] BLOCKED: ${reason}\n`);
  process.exit(2);
}

function main() {
  if (process.env.DEMO2PROJECT_HOOKS_DISABLED === '1') return;

  let event;
  try {
    const raw = readFileSync(0, 'utf8');
    event = JSON.parse(raw || '{}');
  } catch {
    return; // fail-open on unparseable input
  }

  const toolName = event.tool_name ?? '';
  const toolInput = event.tool_input ?? {};
  const cmd = (toolInput.command ?? '').toString();
  const projectDir = event.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

  const FORBIDDEN = [
    { re: /\brm\s+-rf?\s+\/(\s|$)/, reason: 'rm -rf /' },
    { re: /\brm\s+-rf?\s+~(\s|$|\/)/, reason: 'rm -rf on $HOME' },
    { re: /\bsudo\b/, reason: 'sudo escalation' },
    { re: /\b(shutdown|reboot|halt)\b/, reason: 'system power command' },
    { re: /\bmkfs(\.|\s)/, reason: 'filesystem format' },
    { re: /\bdd\s+[^|]*\bif=/, reason: 'dd if=' },
    { re: /(curl|wget)\b[^|]*\|\s*(sudo\s+)?(sh|bash|zsh)\b/, reason: 'piping remote script to shell' },
    { re: /:\(\)\s*\{\s*:\|:&\s*\}/, reason: 'fork bomb' },
    { re: /\b(chmod|chown)\s+-R?\s+777\s+\/(\s|$)/, reason: 'chmod 777 on root' },
    { re: />\s*\/dev\/sd[a-z]/, reason: 'raw disk write' },
  ];
  const SECRET_PATHS = [
    /(^|\/)\.env(\.|$)/,
    /\.pem$/,
    /id_rsa(\.pub)?$/,
    /\.p12$/,
    /authorized_keys$/,
    /\.gnupg\//,
  ];

  if (toolName === 'Bash' && cmd) {
    for (const f of FORBIDDEN) {
      if (f.re.test(cmd)) block(`unsafe command: ${f.reason}`);
    }
    if (/\bcd\s+\/(?!tmp|var\/folders|private\/tmp)/.test(cmd)) {
      block('cd to absolute path outside project not allowed (override with DEMO2PROJECT_HOOKS_DISABLED=1)');
    }
    if (/\b(cat|less|more|head|tail|nl|hexdump)\b/.test(cmd)) {
      for (const re of SECRET_PATHS) {
        if (re.test(cmd)) block('reading secret-shaped path blocked');
      }
    }
  }

  const targetPath = toolInput.file_path ?? toolInput.path ?? '';
  if (targetPath && (toolName === 'Write' || toolName === 'Edit' || toolName === 'MultiEdit')) {
    for (const re of SECRET_PATHS) {
      if (re.test(String(targetPath))) block('write to secret-shaped path blocked');
    }
    const abs = path.resolve(projectDir, String(targetPath));
    const rel = path.relative(projectDir, abs);
    if (rel.startsWith('..')) block(`write outside project_dir blocked: ${abs}`);
  }
}

main();
process.exit(0);
