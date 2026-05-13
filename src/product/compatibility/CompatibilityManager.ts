import { promisify } from 'node:util';
import { exec } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileExists } from '../../utils/fs.js';

const exec_ = promisify(exec);

export interface ToolStatus {
  name: string;
  found: boolean;
  version?: string;
  required: boolean;
  notes?: string;
}

export interface CompatibilityReport {
  generated_at: string;
  os: string;
  arch: string;
  node_runtime: string;
  tools: ToolStatus[];
  supported_archetypes: string[];
  supported_providers: string[];
  warnings: string[];
  required_actions: string[];
}

async function probe(name: string, cmd: string, required: boolean, notes?: string): Promise<ToolStatus> {
  try {
    const r = await exec_(cmd, { timeout: 5000 });
    return { name, found: true, version: r.stdout.trim().split('\n')[0], required, notes };
  } catch {
    return { name, found: false, required, notes };
  }
}

export async function check(_systemRoot: string, projectPath?: string): Promise<CompatibilityReport> {
  const tools: ToolStatus[] = [];
  tools.push(await probe('node', 'node --version', true, 'Node 20+ required'));
  tools.push(await probe('pnpm', 'pnpm --version', true, 'recommended; npm works too'));
  tools.push(await probe('npm', 'npm --version', false));
  tools.push(await probe('git', 'git --version', true));
  tools.push(await probe('claude', 'claude --version', false, 'optional; required for claude-cli provider'));
  tools.push(await probe('typescript', 'tsc --version', false));
  tools.push(await probe('python', 'python3 --version', false, 'optional; required for Python archetype handlers'));
  const required = tools.filter((t) => t.required && !t.found);
  const warnings: string[] = [];
  if (required.length > 0) warnings.push(`${required.length} required tool(s) missing`);
  if (projectPath && !fileExists(path.join(projectPath, '.git'))) warnings.push('project is not a git repository — iteration workspace will fail');
  return {
    generated_at: new Date().toISOString(),
    os: os.platform(),
    arch: os.arch(),
    node_runtime: process.version,
    tools,
    supported_archetypes: ['node-cli', 'typescript-library', 'react-app', 'nextjs-app', 'python-cli', 'python-package', 'fastapi-api', 'monorepo', 'docs-only-project', 'agent-framework', 'unknown'],
    supported_providers: ['mock', 'local-command', 'rule-based', 'naive-baseline', 'claude-code', 'claude-cli'],
    warnings,
    required_actions: required.map((t) => `install ${t.name}`),
  };
}

