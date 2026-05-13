import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { projectReport, securityReport, writeReport, renderToHtml } from '../../src/product/reports/ReportSystem.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('ReportSystem', () => {
  it('produces a project report doc', async () => {
    const doc = await projectReport(root, path.join(root, 'examples', 'bad-demo'));
    expect(doc.type).toBe('project-report');
    expect(doc.summary).toBeTruthy();
  });
  it('produces a security report doc', async () => {
    const doc = await securityReport(root);
    expect(doc.type).toBe('security-report');
  });
  it('writeReport writes MD and JSON', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rsys-'));
    const doc = await projectReport(root, path.join(root, 'examples', 'bad-demo'));
    const r = await writeReport(tmp, doc, ['markdown', 'json']);
    expect(r.paths.markdown).toBeTruthy();
    expect(r.paths.json).toBeTruthy();
  });
  it('renderToHtml writes an html file from a json report', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rsys-'));
    const doc = await projectReport(root, path.join(root, 'examples', 'bad-demo'));
    const r = await writeReport(tmp, doc, ['json']);
    const html = await renderToHtml(r.paths.json!, path.join(tmp, 'r.html'));
    const txt = await fs.readFile(html.written, 'utf8');
    expect(txt).toContain('<html');
  });
});
