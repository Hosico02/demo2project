import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AnalyzerAgent } from '../src/agents/AnalyzerAgent.js';
import { PlannerAgent } from '../src/agents/PlannerAgent.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const badDemo = path.resolve(here, '..', 'examples', 'bad-demo');

describe('iterationPlanner', () => {
  it('produces tasks with acceptance criteria and verification commands', async () => {
    const analyzer = new AnalyzerAgent();
    const planner = new PlannerAgent();
    const { gap } = await analyzer.fullAnalyze(badDemo);
    const plan = planner.plan(gap, 'project-ready');
    expect(plan.tasks.length).toBeGreaterThan(0);
    for (const t of plan.tasks) {
      expect(t.acceptance_criteria.length).toBeGreaterThan(0);
      expect(t.verification_commands.length).toBeGreaterThan(0);
      expect(t.iteration_id).toBe(plan.iteration_id);
    }
    expect(plan.stop_conditions.length).toBeGreaterThan(0);
    expect(plan.expected_score_delta).toBeGreaterThan(0);
  });
});
