import path from 'node:path';
import { promises as fs } from 'node:fs';
import { EvidenceGraph } from '../../core/evidenceGraph.js';
import { stateDir } from '../../utils/paths.js';
import { flagString, requireProject } from './_shared.js';

export async function evidenceShow(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  let iter = flagString(flags, 'iteration');
  if (!iter) {
    // pick the latest
    try {
      const entries = await fs.readdir(path.join(stateDir(project), 'evidence'));
      const json = entries.filter((e) => e.endsWith('.json')).sort();
      iter = json.length ? json[json.length - 1]!.replace('.json', '') : undefined;
    } catch { /* no graph yet */ }
  }
  if (!iter) {
    process.stderr.write('error: no evidence graph available; pass --iteration <id>\n');
    return 1;
  }
  const file = await EvidenceGraph.load(project, iter);
  if (!file) {
    process.stderr.write(`error: no evidence graph at iteration ${iter}\n`);
    return 1;
  }
  process.stdout.write(JSON.stringify(file, null, 2) + '\n');
  process.stdout.write(`\n>> ${file.evidence.length} evidence node(s), ${file.claims.length} claim(s)\n`);
  return 0;
}

export async function evidenceExplain(flags: Record<string, string | boolean>): Promise<number> {
  const project = requireProject(flags);
  if (!project) return 2;
  const claimId = flagString(flags, 'claim');
  const iter = flagString(flags, 'iteration');
  if (!claimId) {
    process.stderr.write('error: --claim <id> required\n');
    return 2;
  }
  if (!iter) {
    process.stderr.write('error: --iteration <id> required\n');
    return 2;
  }
  const file = await EvidenceGraph.load(project, iter);
  if (!file) return 1;
  const graph = EvidenceGraph.fromFile(file);
  const { claim, evidence } = graph.explainClaim(claimId);
  if (!claim) {
    process.stderr.write(`error: no claim "${claimId}"\n`);
    return 1;
  }
  process.stdout.write(JSON.stringify({ claim, evidence }, null, 2) + '\n');
  return 0;
}
