import path from 'node:path';
import { ensureDir, writeText } from '../../utils/fs.js';
import { writeJson } from '../../utils/json.js';
import { check } from '../../product/compatibility/CompatibilityManager.js';
import { defaultSystemRoot, flagString } from './_shared.js';

export async function compatibility(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = flagString(flags, 'project');
  const r = await check(defaultSystemRoot(), projectPath);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return r.required_actions.length === 0 ? 0 : 1;
}

export async function compatibilityReport(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = flagString(flags, 'project');
  const root = defaultSystemRoot();
  const r = await check(root, projectPath);
  const dir = path.join(root, 'reports', 'compatibility');
  await ensureDir(dir);
  await writeJson(path.join(dir, 'compatibility.json'), r);
  const md = [`# Compatibility`, ``, `OS: ${r.os}/${r.arch}`, `Node runtime: ${r.node_runtime}`, ``, `## Tools`, ...r.tools.map((t) => `- ${t.name}: ${t.found ? 'found ' + (t.version ?? '') : 'MISSING'} (${t.required ? 'required' : 'optional'})`)];
  await writeText(path.join(dir, 'compatibility.md'), md.join('\n') + '\n');
  process.stdout.write(JSON.stringify({ json: path.join(dir, 'compatibility.json'), md: path.join(dir, 'compatibility.md') }, null, 2) + '\n');
  return 0;
}
