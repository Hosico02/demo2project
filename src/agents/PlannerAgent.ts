import type { GapReport, IterationPlan } from '../core/types.js';
import { planIteration } from '../core/iterationPlanner.js';

export class PlannerAgent {
  plan(gap: GapReport, goal: string, iterationId?: string): IterationPlan {
    return planIteration(gap, goal, iterationId);
  }
}
