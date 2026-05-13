import path from 'node:path';
import { promises as fs } from 'node:fs';
import { readJsonSafe } from '../../utils/json.js';
import { fileExists } from '../../utils/fs.js';
import { classifySource } from './PluginTrustPolicy.js';

export interface PluginFinding {
  plugin: string;
  source: string;
  trust: string;
  has_hooks: boolean;
  has_mcp: boolean;
  has_commands: boolean;
  risk: 'low' | 'medium' | 'high' | 'critical';
  reasons: string[];
}

export interface PluginScanReport {
  scanned_paths: string[];
  plugins_found: number;
  findings: PluginFinding[];
}

async function readDirSafe(p: string): Promise<string[]> {
  try { return await fs.readdir(p); } catch { return []; }
}

export async function scan(systemRoot: string, projectPath?: string): Promise<PluginScanReport> {
  const roots = [
    path.join(process.env.HOME ?? '', '.claude', 'plugins'),
    path.join(systemRoot, '.claude', 'plugins'),
    projectPath ? path.join(projectPath, '.claude', 'plugins') : null,
  ].filter(Boolean) as string[];
  const findings: PluginFinding[] = [];
  const scanned: string[] = [];
  for (const root of roots) {
    if (!fileExists(root)) continue;
    scanned.push(root);
    const entries = await readDirSafe(root);
    for (const name of entries) {
      const pdir = path.join(root, name);
      const reasons: string[] = [];
      let risk: PluginFinding['risk'] = 'low';
      const manifest = await readJsonSafe<{ source?: string; mcp?: unknown; hooks?: unknown; commands?: unknown }>(path.join(pdir, 'plugin.json'));
      const source = manifest?.source ?? name;
      const trust = classifySource(source);
      const hasHooks = !!manifest?.hooks || fileExists(path.join(pdir, 'hooks'));
      const hasMcp = !!manifest?.mcp || fileExists(path.join(pdir, 'mcp.json'));
      const hasCommands = !!manifest?.commands || fileExists(path.join(pdir, 'commands'));
      if (hasHooks) { reasons.push('plugin installs hooks'); risk = 'high'; }
      if (hasMcp) { reasons.push('plugin registers MCP server(s)'); risk = 'high'; }
      if (trust.trust === 'untrusted') { reasons.push('untrusted source'); risk = risk === 'high' ? 'critical' : 'high'; }
      findings.push({ plugin: name, source, trust: trust.trust, has_hooks: hasHooks, has_mcp: hasMcp, has_commands: hasCommands, risk, reasons });
    }
  }
  return { scanned_paths: scanned, plugins_found: findings.length, findings };
}
