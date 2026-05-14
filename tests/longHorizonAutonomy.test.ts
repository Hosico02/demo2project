import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runAutonomySession, listSessions } from '../src/eval/longHorizonAutonomy.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

async function tmpProj(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'd2p-lh-'));
  await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'lh', main: 'app.js' }));
  await fs.writeFile(path.join(dir, 'app.js'), 'console.log(1);\n');
  return dir;
}

describe('LongHorizonAutonomyController', () => {
  it('runs a 2-iteration session and persists it', async () => {
    const proj = await tmpProj();
    const session = await runAutonomySession({
      projectPath: proj,
      iterations: 2,
      providerName: 'rule-based',
      systemRoot: repoRoot,
      updateRegressionSpec: false,
    });
    expect(session.iterations.length).toBeGreaterThan(0);
    expect(['completed', 'stopped', 'rolled_back', 'pending_approval']).toContain(session.status);
    const list = await listSessions(proj);
    expect(list.find((s) => s.id === session.id)).toBeTruthy();
  });
  it('emits trend_summary at session end', async () => {
    const proj = await tmpProj();
    const session = await runAutonomySession({
      projectPath: proj, iterations: 1, providerName: 'rule-based', systemRoot: repoRoot, updateRegressionSpec: false,
    });
    expect(session.trend_summary).toBeDefined();
    expect(typeof session.trend_summary!.score_last).toBe('number');
  });
});
