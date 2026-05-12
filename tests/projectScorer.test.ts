import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { takeSnapshot } from '../src/core/projectSnapshot.js';
import { scoreProject } from '../src/core/projectScorer.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const badDemo = path.join(repoRoot, 'examples', 'bad-demo');

describe('projectScorer', () => {
  it('scores bad-demo well below the repo itself', async () => {
    const badSnap = await takeSnapshot(badDemo);
    const goodSnap = await takeSnapshot(repoRoot);
    const badScore = await scoreProject(badSnap);
    const goodScore = await scoreProject(goodSnap);
    expect(badScore.total).toBeLessThan(goodScore.total);
    expect(badScore.grade).toMatch(/raw_demo|working_demo/);
  });

  it('produces breakdown that sums approximately to total', async () => {
    const snap = await takeSnapshot(repoRoot);
    const score = await scoreProject(snap);
    const sum = Object.values(score.breakdown).reduce((a, b) => a + b, 0);
    expect(Math.round(sum)).toBe(score.total);
  });
});
