#!/usr/bin/env node
/**
 * Demo2Project — PostToolUse evidence recorder (Phase 7).
 *
 * Persists a minimal evidence node summarising the tool invocation. Used by
 * Demo2Project to corroborate verification claims later.
 */
import { readFileSync, mkdirSync, appendFileSync } from 'node:fs';
import path from 'node:path';

try {
  if (process.env.DEMO2PROJECT_HOOKS_DISABLED === '1') process.exit(0);
  const event = JSON.parse(readFileSync(0, 'utf8') || '{}');
  const projectDir = event.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  const dir = path.join(projectDir, '.demo2project', 'evidence');
  mkdirSync(dir, { recursive: true });
  const node = {
    timestamp: new Date().toISOString(),
    kind: 'hook_evidence',
    tool: event.tool_name ?? '',
    target: event.tool_input?.file_path ?? event.tool_input?.command ?? '',
    is_error: !!event.tool_response?.is_error,
  };
  appendFileSync(path.join(dir, 'hook-evidence.jsonl'), JSON.stringify(node) + '\n');
} catch { /* fail-open */ }
process.exit(0);
