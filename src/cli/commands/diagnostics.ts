import { ERROR_CATALOG, findError } from '../../product/diagnostics/ErrorCatalog.js';
import { advise, explainEntry } from '../../product/diagnostics/RemediationAdvisor.js';
import { explainLog, summary as troubleSummary } from '../../product/diagnostics/TroubleshootingGuide.js';
import { readTextSafe } from '../../utils/fs.js';
import { flagString } from './_shared.js';

export async function diagnoseCmd(flags: Record<string, string | boolean>): Promise<number> {
  const code = flagString(flags, 'error');
  if (code) {
    const e = findError(code);
    if (!e) { process.stderr.write(`unknown error: ${code}\n`); return 1; }
    process.stdout.write(explainEntry(e) + '\n');
    return 0;
  }
  process.stdout.write(JSON.stringify({ total: ERROR_CATALOG.length, codes: ERROR_CATALOG.map((e) => `${e.code} — ${e.title}`) }, null, 2) + '\n');
  return 0;
}

export async function logsExplain(flags: Record<string, string | boolean>): Promise<number> {
  const file = flagString(flags, 'file');
  if (!file) { process.stderr.write('--file required\n'); return 2; }
  const txt = await readTextSafe(file);
  if (txt === null) { process.stderr.write(`cannot read ${file}\n`); return 1; }
  const r = explainLog(txt);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}

export async function troubleshoot(_flags: Record<string, string | boolean>): Promise<number> {
  const s = troubleSummary();
  process.stdout.write(JSON.stringify(s, null, 2) + '\n');
  return 0;
}

export async function remediation(flags: Record<string, string | boolean>): Promise<number> {
  const code = flagString(flags, 'error');
  if (!code) { process.stderr.write('--error required\n'); return 2; }
  const r = advise(code);
  if (!r) { process.stderr.write(`unknown error: ${code}\n`); return 1; }
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  return 0;
}
