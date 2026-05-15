import { describe, expect, it } from 'vitest';
import { inferMarketResearchDomain } from '../../src/research/domainInference.js';
import type { ProjectSnapshot } from '../../src/core/types.js';

function snapshot(overrides: Partial<ProjectSnapshot> = {}): ProjectSnapshot {
  return {
    project_path: '/tmp/project',
    detected_language: 'python',
    detected_frameworks: ['flask'],
    package_manager: 'pip',
    test_commands: [],
    build_commands: [],
    start_commands: ['python3 app.py'],
    important_files: ['README.md', 'app.py', 'game.py', 'prompts.py'],
    missing_files: [],
    dependency_summary: { runtime: 2, dev: 0, has_lockfile: false },
    timestamp: new Date(0).toISOString(),
    ...overrides,
  };
}

describe('inferMarketResearchDomain', () => {
  it('keeps agent-facing werewolf projects in an agent-theater domain despite Flask API wrappers', () => {
    const sourceText = [
      '# 狼人杀 Multi-Agent Theater',
      'LLM agents play werewolf for human observers.',
      'roles include werewolf, seer, witch, hunter, guard, idiot and villager.',
      'GAME_MODES = {"m9": {"roles": ["werewolf", "seer"]}}',
    ].join('\n');

    expect(inferMarketResearchDomain(snapshot(), sourceText)).toBe('agent_social_deduction_theater');
  });

  it('keeps human social deduction products in the ordinary werewolf market domain', () => {
    const sourceText = [
      '# Werewolf Online',
      'Create rooms, invite friends and play social deduction with voice chat.',
      'roles include werewolf, seer, witch, hunter, guard and villager.',
      'GAME_MODES = {"m9": {"roles": ["werewolf", "seer"]}}',
    ].join('\n');

    expect(inferMarketResearchDomain(snapshot(), sourceText)).toBe('social_deduction_game');
  });

  it('still recognizes plain Flask JSON services as API products', () => {
    const sourceText = [
      'from flask import Flask, jsonify, request',
      '@app.get("/healthz")',
      '@app.post("/summarize")',
      'def summarize(): return jsonify({"ok": True})',
    ].join('\n');

    expect(inferMarketResearchDomain(snapshot({
      important_files: ['README.md', 'app.py', 'requirements.txt'],
    }), sourceText)).toBe('api_service');
  });
});
