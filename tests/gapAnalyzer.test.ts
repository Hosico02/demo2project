import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AnalyzerAgent } from '../src/agents/AnalyzerAgent.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const badDemo = path.resolve(here, '..', 'examples', 'bad-demo');

describe('gapAnalyzer', () => {
  it('flags missing README, missing tests, and missing test/build commands for bad-demo', async () => {
    const agent = new AnalyzerAgent();
    const { gap } = await agent.fullAnalyze(badDemo);
    const categories = gap.findings.map((f) => f.category);
    expect(categories).toContain('missing_readme');
    expect(categories).toContain('no_tests');
    expect(gap.findings.some((f) => f.category === 'missing_required_command' && /test/.test(f.message))).toBe(true);
    expect(gap.blockers.length).toBeGreaterThan(0);
  });
});
