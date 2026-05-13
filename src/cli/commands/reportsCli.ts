import path from 'node:path';
import { projectReport, securityReport, trustReport, writeReport, renderToHtml, listReports } from '../../product/reports/ReportSystem.js';
import { defaultSystemRoot, flagString, requireProject } from './_shared.js';

export async function reportProject(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = requireProject(flags);
  if (!projectPath) return 2;
  const doc = await projectReport(defaultSystemRoot(), projectPath);
  const r = await writeReport(defaultSystemRoot(), doc, ['markdown', 'json']);
  process.stdout.write(JSON.stringify({ paths: r.paths, summary: doc.summary }, null, 2) + '\n');
  return 0;
}

export async function reportSecurity(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = typeof flags.project === 'string' ? flags.project : undefined;
  const doc = await securityReport(defaultSystemRoot(), projectPath);
  const r = await writeReport(defaultSystemRoot(), doc, ['markdown', 'json']);
  process.stdout.write(JSON.stringify({ paths: r.paths, summary: doc.summary }, null, 2) + '\n');
  return 0;
}

export async function reportTrust(flags: Record<string, string | boolean>): Promise<number> {
  const projectPath = typeof flags.project === 'string' ? flags.project : undefined;
  const doc = await trustReport(defaultSystemRoot(), projectPath);
  const r = await writeReport(defaultSystemRoot(), doc, ['markdown', 'json']);
  process.stdout.write(JSON.stringify({ paths: r.paths, summary: doc.summary }, null, 2) + '\n');
  return 0;
}

export async function reportHtml(flags: Record<string, string | boolean>): Promise<number> {
  const report = flagString(flags, 'report');
  if (!report) { process.stderr.write('--report <path-to-report.json> required\n'); return 2; }
  const out = flagString(flags, 'out') ?? report.replace(/\.json$/, '.html');
  const r = await renderToHtml(report, out);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function reportIndex(_flags: Record<string, string | boolean>): Promise<number> {
  const r = await listReports(defaultSystemRoot());
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

void path;
