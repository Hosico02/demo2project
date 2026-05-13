import path from 'node:path';
import { readJsonSafe } from '../../utils/json.js';
import { fileExists } from '../../utils/fs.js';

export interface McpFinding {
  server: string;
  command: string;
  args: string[];
  requests_fs: boolean;
  requests_network: boolean;
  risk: 'low' | 'medium' | 'high' | 'critical';
  reasons: string[];
}

export interface McpScanReport {
  config_paths: string[];
  servers_found: number;
  findings: McpFinding[];
}

const NETWORK_HINTS = /(curl|wget|fetch|http|https|nc\b)/;
const FS_HINTS = /(fs|file|read|write|access|filesystem)/i;

export async function scan(systemRoot: string, projectPath?: string): Promise<McpScanReport> {
  const candidates = [
    path.join(process.env.HOME ?? '', '.claude', 'mcp.json'),
    path.join(systemRoot, '.claude', 'mcp.json'),
    projectPath ? path.join(projectPath, '.claude', 'mcp.json') : null,
    projectPath ? path.join(projectPath, '.mcp.json') : null,
  ].filter(Boolean) as string[];
  const findings: McpFinding[] = [];
  const seen: string[] = [];
  for (const c of candidates) {
    if (!fileExists(c)) continue;
    seen.push(c);
    const cfg = await readJsonSafe<{ mcpServers?: Record<string, { command: string; args?: string[]; description?: string }>; servers?: Record<string, { command: string; args?: string[] }> }>(c);
    const servers = cfg?.mcpServers ?? cfg?.servers ?? {};
    for (const [name, def] of Object.entries(servers)) {
      const cmd = def.command ?? '';
      const args = def.args ?? [];
      const combined = [cmd, ...args].join(' ');
      const reasons: string[] = [];
      let risk: McpFinding['risk'] = 'medium';
      const fs = FS_HINTS.test(combined);
      const net = NETWORK_HINTS.test(combined);
      if (fs) { reasons.push('appears to request filesystem access'); risk = 'high'; }
      if (net) { reasons.push('appears to request network access'); risk = risk === 'high' ? 'critical' : 'high'; }
      findings.push({ server: name, command: cmd, args, requests_fs: fs, requests_network: net, risk, reasons });
    }
  }
  return { config_paths: seen, servers_found: findings.length, findings };
}
