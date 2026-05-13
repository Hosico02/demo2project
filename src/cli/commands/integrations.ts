import path from 'node:path';
import { scan as scanPlugins } from '../../security/plugins/PluginSecurityScanner.js';
import { scan as scanMcp } from '../../security/plugins/McpSecurityScanner.js';
import { scan as scanHooks } from '../../security/plugins/HookSecurityScanner.js';
import { ensureDir, writeText } from '../../utils/fs.js';
import { writeJson } from '../../utils/json.js';
import { defaultSystemRoot } from './_shared.js';

export async function pluginScan(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = typeof flags.project === 'string' ? flags.project : undefined;
  const r = await scanPlugins(defaultSystemRoot(), projectPath);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function mcpScan(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = typeof flags.project === 'string' ? flags.project : undefined;
  const r = await scanMcp(defaultSystemRoot(), projectPath);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function hooksScan(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = typeof flags.project === 'string' ? flags.project : undefined;
  const r = await scanHooks(defaultSystemRoot(), projectPath);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function integrationSecurityReport(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = typeof flags.project === 'string' ? flags.project : undefined;
  const root = defaultSystemRoot();
  const plugins = await scanPlugins(root, projectPath);
  const mcp = await scanMcp(root, projectPath);
  const hooks = await scanHooks(root, projectPath);
  const dir = path.join(root, 'reports', 'security');
  await ensureDir(dir);
  const data = { plugins, mcp, hooks };
  const jsonPath = path.join(dir, 'integrations.json');
  const mdPath = path.join(dir, 'integrations.md');
  await writeJson(jsonPath, data);
  await writeText(mdPath, `# Integration Security\n\n- Plugins: ${plugins.plugins_found}\n- MCP servers: ${mcp.servers_found}\n- Hooks: ${hooks.hooks_found}\n`);
  process.stdout.write(JSON.stringify({ summary: { plugins: plugins.plugins_found, mcp: mcp.servers_found, hooks: hooks.hooks_found }, report: { json: jsonPath, md: mdPath } }, null, 2) + '\n');
  return 0;
}
